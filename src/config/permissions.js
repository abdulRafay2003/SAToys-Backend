/**
 * Permissions are `resource:action` strings. A Role holds a list of them; the
 * `requirePermission` middleware checks membership.
 *
 * An explicit list (rather than free-form strings) means a typo in a seeded role
 * is caught at boot instead of silently granting nothing.
 */

const RESOURCES = [
  'product',
  'category',
  'brand',
  'collection',
  'review',
  'post',
  'faq',
  'testimonial',
  'coupon',
  'shipping',
  'banner',
  'home',
  'nav',
  'order',
  'customer',
  'inventory',
  'settings',
  'role',
  'upload',
  'analytics',
];

const ACTIONS = ['create', 'read', 'update', 'delete'];

/** Every valid permission string. */
const ALL_PERMISSIONS = RESOURCES.flatMap((r) => ACTIONS.map((a) => `${r}:${a}`));

/** Wildcard understood by the checker: grants everything. */
const SUPER = '*';

const isValidPermission = (p) => p === SUPER || ALL_PERMISSIONS.includes(p);

const crud = (...resources) => resources.flatMap((r) => ACTIONS.map((a) => `${r}:${a}`));
const readOnly = (...resources) => resources.map((r) => `${r}:read`);

const CATALOGUE = ['product', 'category', 'brand', 'collection', 'inventory'];
const CONTENT = ['post', 'faq', 'testimonial', 'banner', 'home', 'nav'];

/**
 * Seeded roles. `isSystem` roles cannot be deleted through the admin panel —
 * deleting `super-admin` would lock everyone out.
 */
const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Unrestricted access, including roles and settings.',
    permissions: [SUPER],
    isSystem: true,
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Manages the catalogue, content, orders and customers.',
    permissions: [
      ...crud(...CATALOGUE, ...CONTENT, 'review', 'coupon', 'shipping', 'order', 'customer'),
      'upload:create',
      'upload:delete',
      'upload:read',
      'analytics:read',
      'settings:read',
      'settings:update',
    ],
    isSystem: true,
  },
  {
    name: 'Staff',
    slug: 'staff',
    description: 'Day-to-day catalogue and order work. No settings or roles.',
    permissions: [
      ...crud('product', 'inventory'),
      ...readOnly('category', 'brand', 'collection', 'customer'),
      'review:read',
      'review:update',
      'order:read',
      'order:update',
      'upload:create',
      'upload:read',
      'analytics:read',
    ],
    isSystem: true,
  },
  {
    name: 'Customer',
    slug: 'customer',
    description: 'Storefront shopper. No admin access at all.',
    permissions: [],
    isSystem: true,
  },
];

module.exports = {
  RESOURCES,
  ACTIONS,
  ALL_PERMISSIONS,
  SUPER,
  SYSTEM_ROLES,
  isValidPermission,
};
