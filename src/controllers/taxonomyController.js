const { Category, Brand, Collection, Product } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/respond');
const crudFactory = require('./crudFactory');
const S = require('../services/serialisers');

/**
 * Category, Brand and Collection are structurally the same resource: a slugged,
 * sortable, toggleable taxonomy node. They share the CRUD factory and differ
 * only in their referential guards and their public reads.
 */

/**
 * Refuse to delete a taxonomy node that products still point at. The alternative
 * — cascading — would silently uncategorise a catalogue, and the alternative to
 * that (orphan refs) breaks the storefront's slug lookups.
 */
const guardInUse = (field, label) => async (doc) => {
  const count = await Product.countDocuments({ [field]: doc._id });
  if (count) {
    throw ApiError.conflict(
      `${count} product${count === 1 ? '' : 's'} still use this ${label}. Reassign them first, or deactivate it instead.`,
    );
  }
};

// --- Admin CRUD --------------------------------------------------------------

const categoryCrud = crudFactory({
  Model: Category,
  name: 'Category',
  searchFields: ['name', 'slug'],
  slugFrom: 'name',
  populate: [{ path: 'parent', select: 'name slug' }],
  serialise: (d) => ({
    ...S.category(d),
    isActive: d.isActive,
    parent: d.parent ? String(d.parent._id || d.parent) : null,
    seo: d.seo,
  }),
  beforeDelete: async (doc) => {
    const children = await Category.countDocuments({ parent: doc._id });
    if (children) {
      throw ApiError.conflict(`This category has ${children} sub-categor${children === 1 ? 'y' : 'ies'}. Delete or move them first.`);
    }
    await guardInUse('categories', 'category')(doc);
  },
});

const brandCrud = crudFactory({
  Model: Brand,
  name: 'Brand',
  searchFields: ['name', 'slug', 'origin'],
  slugFrom: 'name',
  serialise: (d) => ({ ...S.brand(d), isActive: d.isActive, sortOrder: d.sortOrder, seo: d.seo }),
  beforeDelete: guardInUse('brand', 'brand'),
});

const collectionCrud = crudFactory({
  Model: Collection,
  name: 'Collection',
  searchFields: ['name', 'slug'],
  slugFrom: 'name',
  serialise: (d) => ({
    ...S.collection(d),
    isActive: d.isActive,
    sortOrder: d.sortOrder,
    startsAt: S.iso(d.startsAt),
    endsAt: S.iso(d.endsAt),
    seo: d.seo,
  }),
  beforeDelete: guardInUse('collections', 'collection'),
});

// --- Public reads ------------------------------------------------------------

/**
 * GET /categories — the whole active tree, nested.
 *
 * Returned as a tree rather than a flat list because every consumer (mega menu,
 * category index, filter rail) needs the nesting, and doing it here once beats
 * three client-side groupings that can disagree.
 */
const listCategories = asyncHandler(async (req, res) => {
  const docs = await Category.find({ isActive: true })
    .sort({ sortOrder: 1, name: 1 })
    .populate({ path: 'parent', select: 'slug' })
    .lean();

  const roots = [];
  const byId = new Map();

  for (const d of docs) {
    byId.set(String(d._id), { ...S.category(d), children: [] });
  }
  for (const d of docs) {
    const node = byId.get(String(d._id));
    const parentId = d.parent ? String(d.parent._id) : null;
    if (parentId && byId.has(parentId)) byId.get(parentId).children.push(node);
    else roots.push(node);
  }

  return ok(res, roots);
});

const getCategory = asyncHandler(async (req, res) => {
  const doc = await Category.findOne({ slug: req.params.slug, isActive: true }).populate({
    path: 'parent',
    select: 'slug name',
  });
  if (!doc) throw ApiError.notFound('Category');

  const children = await Category.find({ parent: doc._id, isActive: true })
    .sort({ sortOrder: 1 })
    .lean();

  return ok(res, { ...S.category(doc), children: children.map(S.category) });
});

const listBrands = asyncHandler(async (req, res) => {
  const docs = await Brand.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  return ok(res, docs.map(S.brand));
});

const getBrand = asyncHandler(async (req, res) => {
  const doc = await Brand.findOne({ slug: req.params.slug, isActive: true });
  if (!doc) throw ApiError.notFound('Brand');
  return ok(res, S.brand(doc));
});

const listCollections = asyncHandler(async (req, res) => {
  const q = req.validatedQuery || req.query;
  const filter = { isActive: true };
  if (q.seasonal !== undefined) filter.isSeasonal = q.seasonal;

  const docs = await Collection.find(filter).sort({ sortOrder: 1, name: 1 }).lean();
  return ok(res, docs.map(S.collection));
});

const getCollection = asyncHandler(async (req, res) => {
  const doc = await Collection.findOne({ slug: req.params.slug, isActive: true });
  if (!doc) throw ApiError.notFound('Collection');
  return ok(res, S.collection(doc));
});

module.exports = {
  categoryCrud,
  brandCrud,
  collectionCrud,
  listCategories,
  getCategory,
  listBrands,
  getBrand,
  listCollections,
  getCollection,
};
