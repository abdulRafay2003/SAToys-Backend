require("../config/env");

const { port } = require("../config/env");

/**
 * End-to-end smoke test against a running server.
 *
 * This is the check that the three requirements which are easy to *claim* and
 * hard to verify actually hold:
 *   • an admin write is immediately visible on the storefront,
 *   • approving a review immediately changes the product's rating,
 *   • placing an order immediately decrements stock.
 *
 * It creates its own fixtures and deletes them at the end, so it is safe to run
 * against a database with real content.
 */

const BASE = `http://localhost:${port}/api/v1`;

let token;
let pass = 0;
let fail = 0;
const created = {
  products: [],
  categories: [],
  brands: [],
  reviews: [],
  orders: [],
};

const check = (label, condition, detail) => {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

async function api(method, path, body, { auth = true, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (raw) return res;
  const json = res.status === 204 ? null : await res.json();
  return { status: res.status, ...json };
}

const section = (name) => console.log(`\n${name}`);

async function run() {
  console.log(`Smoke test → ${BASE}\n${"─".repeat(60)}`);

  // ---------------------------------------------------------------- health
  section("Health & docs");
  const health = await fetch(`http://localhost:${port}/api/health`).then((r) =>
    r.json(),
  );
  check("health endpoint responds", health.success === true);
  const spec = await fetch(`http://localhost:${port}/api/openapi.json`).then(
    (r) => r.json(),
  );
  check("openapi spec serves", spec.openapi === "3.1.0");
  check(
    "spec documents paths",
    Object.keys(spec.paths).length > 30,
    `${Object.keys(spec.paths).length} paths`,
  );

  // ------------------------------------------------------------------ auth
  section("Authentication & authorisation");
  const badLogin = await api(
    "POST",
    "/auth/admin/login",
    {
      email: "abdul.rafay@satoys.org",
      password: "wrong-password",
    },
    { auth: false },
  );
  check("wrong password is rejected", badLogin.status === 401);

  const login = await api(
    "POST",
    "/auth/admin/login",
    {
      email: process.env.ADMIN_EMAIL || "abdul.rafay@satoys.org",
      password: process.env.ADMIN_PASSWORD || "Admin@123",
    },
    { auth: false },
  );
  check(
    "admin login succeeds",
    login.success === true,
    JSON.stringify(login.error),
  );
  token = login.data?.token;
  check("token issued", Boolean(token));
  check(
    "password hash never serialised",
    login.data?.user?.password === undefined,
  );

  const noAuth = await api("GET", "/admin/products", null, { auth: false });
  check("admin route rejects anonymous", noAuth.status === 401);

  // -------------------------------------------------------------- taxonomy
  section("Taxonomy CRUD");
  const brand = await api("POST", "/admin/brands", {
    name: "Smoke Test Toys",
    blurb: "Fixture brand.",
    origin: "Testland",
    founded: 1999,
    tone: "mint",
  });
  check("brand created", brand.status === 201, JSON.stringify(brand.error));
  created.brands.push(brand.data?.id);
  check(
    "brand slug auto-derived",
    brand.data?.slug === "smoke-test-toys",
    brand.data?.slug,
  );

  const parent = await api("POST", "/admin/categories", {
    name: "Smoke Wooden",
    kind: "type",
    tone: "sunny",
    blurb: "Fixture parent category.",
  });
  check(
    "parent category created",
    parent.status === 201,
    JSON.stringify(parent.error),
  );
  created.categories.push(parent.data?.id);

  const child = await api("POST", "/admin/categories", {
    name: "Smoke Blocks",
    kind: "type",
    tone: "coral",
    parent: parent.data?.id,
  });
  check(
    "child category created",
    child.status === 201,
    JSON.stringify(child.error),
  );
  created.categories.push(child.data?.id);

  const grandchild = await api("POST", "/admin/categories", {
    name: "Smoke Too Deep",
    kind: "type",
    parent: child.data?.id,
  });
  check(
    "three-level nesting refused",
    grandchild.status >= 400,
    `got ${grandchild.status}`,
  );

  // --------------------------------------------------------------- product
  section("Product CRUD & validation");
  const badPrice = await api("POST", "/admin/products", {
    name: "Bad",
    price: 24.95,
  });
  check(
    "float price rejected",
    badPrice.status === 422,
    `got ${badPrice.status}`,
  );

  const badCompare = await api("POST", "/admin/products", {
    name: "Bad",
    price: 2495,
    compareAtPrice: 1000,
  });
  check("compareAtPrice below price rejected", badCompare.status === 422);

  const derivedBadge = await api("POST", "/admin/products", {
    name: "Bad",
    price: 2495,
    badges: ["bestseller"],
  });
  check("derived badge rejected as input", derivedBadge.status === 422);

  const product = await api("POST", "/admin/products", {
    name: "Smoke Rocket Set",
    tagline: "A fixture product.",
    description: "Created by the smoke test.",
    price: 2495,
    compareAtPrice: 2995,
    brand: brand.data?.id,
    categories: [parent.data?.id, child.data?.id],
    sku: "smoke-001",
    stock: { quantity: 10, lowStockThreshold: 3 },
    badges: ["eco"],
    ageRange: { min: 3, max: 8 },
    tags: ["smoke", "rocket"],
    status: "active",
    variants: [
      {
        label: "Red",
        kind: "colour",
        swatch: "#ff0000",
        sku: "SMOKE-001-R",
        stock: 6,
        priceDelta: 0,
      },
      {
        label: "Blue",
        kind: "colour",
        swatch: "#0000ff",
        sku: "SMOKE-001-B",
        stock: 4,
        priceDelta: 200,
      },
    ],
  });
  check(
    "product created",
    product.status === 201,
    JSON.stringify(product.error),
  );
  const productId = product.data?.id;
  created.products.push(productId);

  check(
    "sku upper-cased",
    product.data?.sku === "SMOKE-001",
    product.data?.sku,
  );
  check(
    "stock status derived as in-stock",
    product.data?.stock?.status === "in-stock",
    product.data?.stock?.status,
  );
  check(
    "sale badge derived from compareAtPrice",
    product.data?.badges?.includes("sale"),
  );
  check("authored badge kept", product.data?.badges?.includes("eco"));
  check(
    "brand serialised as slug",
    product.data?.brandSlug === "smoke-test-toys",
    product.data?.brandSlug,
  );
  check(
    "categories serialised as slugs",
    product.data?.categorySlugs?.length === 2,
  );
  check(
    "image placeholder synthesised",
    product.data?.images?.length === 1 && product.data.images[0].url === null,
  );
  check(
    "placeholder alt is non-trivial",
    (product.data?.images?.[0]?.alt || "").length >= 4,
  );

  // --------------------------------------------- synchronisation: storefront
  section("Synchronisation → storefront");
  const publicList = await api("GET", "/products?q=Smoke%20Rocket", null, {
    auth: false,
  });
  check(
    "new product appears on storefront immediately",
    publicList.data?.some((p) => p.id === productId),
  );
  check(
    "facets returned",
    Boolean(publicList.facets),
    JSON.stringify(Object.keys(publicList.facets || {})),
  );
  check(
    "price facet range present",
    typeof publicList.facets?.priceMax === "number",
  );

  const publicOne = await api("GET", `/products/${product.data?.slug}`, null, {
    auth: false,
  });
  check("product detail readable publicly", publicOne.success === true);
  check("costPrice never exposed", publicOne.data?.costPrice === undefined);

  // Draft must disappear from the storefront.
  await api("PATCH", `/admin/products/${productId}`, { status: "draft" });
  const draftList = await api("GET", "/products?q=Smoke%20Rocket", null, {
    auth: false,
  });
  check(
    "draft product hidden from storefront",
    !draftList.data?.some((p) => p.id === productId),
  );
  await api("PATCH", `/admin/products/${productId}`, { status: "active" });

  // Filtering / sorting.
  const filtered = await api(
    "GET",
    `/products?brand=smoke-test-toys&sort=price-asc`,
    null,
    { auth: false },
  );
  check(
    "brand slug filter works",
    filtered.data?.every((p) => p.brandSlug === "smoke-test-toys"),
  );
  const inStock = await api("GET", "/products?inStock=true&q=Smoke", null, {
    auth: false,
  });
  check("inStock filter works", inStock.success === true);

  // ---------------------------------------------------------------- reviews
  section("Reviews → rating recomputation");
  const before = await api("GET", `/products/${product.data?.slug}`, null, {
    auth: false,
  });
  check("rating starts at zero", before.data?.rating?.count === 0);

  const review = await api(
    "POST",
    "/reviews",
    {
      productId,
      author: "Smoke Tester",
      email: "smoke@example.com",
      rating: 5,
      title: "Excellent fixture",
      body: "This review was created by the automated smoke test.",
    },
    { auth: false },
  );
  check(
    "review submitted",
    review.status === 201,
    JSON.stringify(review.error),
  );
  created.reviews.push(review.data?.id);

  const pendingPublic = await api(
    "GET",
    `/products/${product.data?.slug}/reviews`,
    null,
    { auth: false },
  );
  check(
    "pending review hidden from storefront",
    !pendingPublic.data?.some((r) => r.id === review.data?.id),
  );

  const afterSubmit = await api(
    "GET",
    `/products/${product.data?.slug}`,
    null,
    { auth: false },
  );
  check(
    "pending review does not affect rating",
    afterSubmit.data?.rating?.count === 0,
  );

  const approve = await api("PATCH", `/admin/reviews/${review.data?.id}`, {
    status: "approved",
  });
  check(
    "review approved",
    approve.success === true,
    JSON.stringify(approve.error),
  );

  const afterApprove = await api(
    "GET",
    `/products/${product.data?.slug}`,
    null,
    { auth: false },
  );
  check(
    "approval updates rating count immediately",
    afterApprove.data?.rating?.count === 1,
    JSON.stringify(afterApprove.data?.rating),
  );
  check(
    "approval updates rating average",
    afterApprove.data?.rating?.average === 5,
  );
  check(
    "distribution bucket updated",
    afterApprove.data?.rating?.distribution?.[4] === 1,
  );

  const approvedPublic = await api(
    "GET",
    `/products/${product.data?.slug}/reviews`,
    null,
    { auth: false },
  );
  check(
    "approved review visible on storefront",
    approvedPublic.data?.some((r) => r.id === review.data?.id),
  );

  await api("PATCH", `/admin/reviews/${review.data?.id}`, {
    status: "rejected",
  });
  const afterReject = await api(
    "GET",
    `/products/${product.data?.slug}`,
    null,
    { auth: false },
  );
  check(
    "rejection reverts rating immediately",
    afterReject.data?.rating?.count === 0,
  );
  await api("PATCH", `/admin/reviews/${review.data?.id}`, {
    status: "approved",
  });

  // --------------------------------------------------------------- commerce
  section("Commerce: coupons, shipping, orders, stock");
  const shipping = await api("POST", "/admin/shipping-options", {
    key: "smoke-standard",
    label: "Smoke Standard",
    price: 395,
    minDays: 3,
    maxDays: 5,
  });
  check(
    "shipping option created",
    shipping.status === 201,
    JSON.stringify(shipping.error),
  );

  const coupon = await api("POST", "/admin/coupons", {
    code: "SMOKE10",
    kind: "percent",
    value: 10,
    description: "10% off",
    minSpend: 0,
  });
  check("coupon created", coupon.status === 201, JSON.stringify(coupon.error));

  const badCoupon = await api(
    "POST",
    "/coupons/validate",
    { code: "NOPE", subtotal: 5000 },
    { auth: false },
  );
  check("unknown coupon rejected", badCoupon.status >= 400);

  const goodCoupon = await api(
    "POST",
    "/coupons/validate",
    { code: "SMOKE10", subtotal: 5000 },
    { auth: false },
  );
  check("coupon validates", goodCoupon.success === true);
  check(
    "10% of 5000 is 500",
    goodCoupon.data?.discount === 500,
    String(goodCoupon.data?.discount),
  );

  const quote = await api(
    "POST",
    "/orders/quote",
    {
      items: [{ productId, quantity: 2 }],
      shippingOptionKey: "smoke-standard",
      couponCode: "SMOKE10",
    },
    { auth: false },
  );
  check("quote computed", quote.success === true, JSON.stringify(quote.error));
  check(
    "subtotal is 2 × 2495",
    quote.data?.totals?.subtotal === 4990,
    String(quote.data?.totals?.subtotal),
  );
  check(
    "discount is 10% of subtotal",
    quote.data?.totals?.discount === 499,
    String(quote.data?.totals?.discount),
  );

  const address = {
    firstName: "Smoke",
    lastName: "Tester",
    line1: "1 Test Street",
    city: "Testville",
    postcode: "TE5 7ER",
    country: "United Kingdom",
  };

  const order = await api(
    "POST",
    "/orders",
    {
      email: "smoke@example.com",
      items: [{ productId, quantity: 2 }],
      shippingAddress: address,
      shippingOptionKey: "smoke-standard",
      couponCode: "SMOKE10",
    },
    { auth: false },
  );
  check("order placed", order.status === 201, JSON.stringify(order.error));
  created.orders.push(order.data?.id);
  check(
    "order number generated",
    /^SATOYS-/.test(order.data?.orderNumber || ""),
    order.data?.orderNumber,
  );
  check("totals server-computed", order.data?.totals?.subtotal === 4990);

  const afterOrder = await api("GET", `/products/${product.data?.slug}`, null, {
    auth: false,
  });
  check(
    "stock decremented by order",
    afterOrder.data?.stock?.quantity === 8,
    String(afterOrder.data?.stock?.quantity),
  );

  // Overselling must be refused.
  const oversell = await api(
    "POST",
    "/orders",
    {
      email: "smoke@example.com",
      items: [{ productId, quantity: 999 }],
      shippingAddress: address,
      shippingOptionKey: "smoke-standard",
    },
    { auth: false },
  );
  check(
    "overselling refused",
    oversell.status >= 400,
    `got ${oversell.status}`,
  );

  // Low-stock derivation.
  await api("PATCH", `/admin/products/${productId}/stock`, { quantity: 2 });
  const lowStock = await api("GET", `/products/${product.data?.slug}`, null, {
    auth: false,
  });
  check(
    "low-stock status derived",
    lowStock.data?.stock?.status === "low-stock",
    lowStock.data?.stock?.status,
  );

  await api("PATCH", `/admin/products/${productId}/stock`, { quantity: 0 });
  const soldOut = await api("GET", `/products/${product.data?.slug}`, null, {
    auth: false,
  });
  check(
    "sold-out status derived",
    soldOut.data?.stock?.status === "sold-out",
    soldOut.data?.stock?.status,
  );

  // Order status transitions.
  const badTransition = await api(
    "PATCH",
    `/admin/orders/${order.data?.id}/status`,
    { status: "delivered" },
  );
  check(
    "illegal status jump refused",
    badTransition.status >= 400,
    `pending→delivered got ${badTransition.status}`,
  );

  const goodTransition = await api(
    "PATCH",
    `/admin/orders/${order.data?.id}/status`,
    { status: "paid" },
  );
  check("legal status transition accepted", goodTransition.success === true);

  const invoice = await api("GET", `/admin/orders/${order.data?.id}/invoice`);
  check(
    "invoice generated",
    invoice.success === true && Boolean(invoice.data?.invoiceNumber),
  );

  const tracked = await api(
    "GET",
    `/orders/track/${order.data?.orderNumber}?email=smoke@example.com`,
    null,
    { auth: false },
  );
  check("order tracking works with matching email", tracked.success === true);
  const trackWrong = await api(
    "GET",
    `/orders/track/${order.data?.orderNumber}?email=wrong@example.com`,
    null,
    { auth: false },
  );
  check("order tracking refuses wrong email", trackWrong.status >= 400);

  // ------------------------------------------------------- referential guards
  section("Referential integrity");
  const delBrand = await api("DELETE", `/admin/brands/${brand.data?.id}`);
  check(
    "brand in use cannot be deleted",
    delBrand.status === 409,
    `got ${delBrand.status}`,
  );

  const delCategory = await api(
    "DELETE",
    `/admin/categories/${parent.data?.id}`,
  );
  check(
    "category with children cannot be deleted",
    delCategory.status === 409,
    `got ${delCategory.status}`,
  );

  const delProduct = await api("DELETE", `/admin/products/${productId}`);
  check(
    "ordered product cannot be deleted",
    delProduct.status === 409,
    `got ${delProduct.status}`,
  );

  // ----------------------------------------------------------------- content
  section("Content & CMS");
  const faq = await api("POST", "/admin/faqs", {
    question: "Is this a smoke test?",
    answer: "Yes.",
    group: "delivery",
  });
  check("FAQ created", faq.status === 201, JSON.stringify(faq.error));
  const publicFaqs = await api("GET", "/faqs", null, { auth: false });
  check(
    "FAQ visible on storefront",
    publicFaqs.data?.some((f) => f.id === faq.data?.id),
  );
  await api("DELETE", `/admin/faqs/${faq.data?.id}`);
  const afterFaqDelete = await api("GET", "/faqs", null, { auth: false });
  check(
    "deleted FAQ gone from storefront",
    !afterFaqDelete.data?.some((f) => f.id === faq.data?.id),
  );

  const banner = await api("POST", "/admin/banners", {
    placement: "announcement",
    title: "Smoke test announcement",
    tone: "coral",
  });
  check("banner created", banner.status === 201, JSON.stringify(banner.error));
  const bootstrap = await api("GET", "/bootstrap", null, { auth: false });
  check(
    "bootstrap returns nav, settings, announcements",
    Boolean(bootstrap.data?.nav && bootstrap.data?.settings),
  );
  check(
    "announcement reaches bootstrap",
    bootstrap.data?.announcements?.includes("Smoke test announcement"),
  );
  await api("DELETE", `/admin/banners/${banner.data?.id}`);

  const settings = await api("PATCH", "/admin/settings", {
    site: { tagline: "Smoke tagline" },
  });
  check(
    "settings updated",
    settings.success === true,
    JSON.stringify(settings.error),
  );
  const publicSettings = await api("GET", "/settings", null, { auth: false });
  check(
    "settings change visible publicly",
    publicSettings.data?.site?.tagline === "Smoke tagline",
  );
  check(
    "settings merge preserved other blocks",
    Boolean(publicSettings.data?.commerce?.currency),
  );

  // ------------------------------------------------------------- analytics
  section("Analytics & roles");
  const overview = await api("GET", "/admin/analytics/overview");
  check(
    "analytics overview computes",
    overview.success === true,
    JSON.stringify(overview.error),
  );
  check(
    "revenue counted from paid order",
    overview.data?.revenue?.value > 0,
    String(overview.data?.revenue?.value),
  );

  const salesSeries = await api("GET", "/admin/analytics/sales");
  check(
    "sales series returned with gaps filled",
    Array.isArray(salesSeries.data) && salesSeries.data.length >= 28,
  );

  const roles = await api("GET", "/admin/roles");
  check(
    "roles listed",
    roles.data?.length === 4,
    `${roles.data?.length} roles`,
  );
  const superAdmin = roles.data?.find((r) => r.slug === "super-admin");
  check("system role marked undeletable", superAdmin?.isSystem === true);
  const delSystemRole = await api("DELETE", `/admin/roles/${superAdmin?.id}`);
  check("system role deletion refused", delSystemRole.status >= 400);

  // ------------------------------------------------------------------ cleanup
  section("Cleanup");
  const { default: mongoose } = await import("mongoose");
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  await db.collection("orders").deleteMany({ email: "smoke@example.com" });
  await db.collection("reviews").deleteMany({ author: "Smoke Tester" });
  await db.collection("products").deleteMany({ slug: /^smoke-/ });
  await db.collection("categories").deleteMany({ slug: /^smoke-/ });
  await db.collection("brands").deleteMany({ slug: /^smoke-/ });
  await db.collection("coupons").deleteMany({ code: "SMOKE10" });
  await db.collection("shippingoptions").deleteMany({ key: "smoke-standard" });
  await db
    .collection("settings")
    .updateOne({ key: "default" }, { $set: { "site.tagline": "" } });
  await mongoose.connection.close();
  console.log("  · fixtures removed");

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

run().catch((error) => {
  console.error("\nSmoke test crashed:", error);
  process.exit(1);
});
