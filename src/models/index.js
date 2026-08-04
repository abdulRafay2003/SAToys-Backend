/**
 * Single import point for models. Requiring this once at boot also guarantees
 * every schema is registered before anything calls `populate`, which otherwise
 * fails with "Schema hasn't been registered" depending on require order.
 */
module.exports = {
  Product: require('./Product'),
  Category: require('./Category'),
  Brand: require('./Brand'),
  Collection: require('./Collection'),
  Review: require('./Review'),
  BlogPost: require('./BlogPost'),
  Faq: require('./Faq'),
  ContactMessage: require('./ContactMessage'),
  Testimonial: require('./Testimonial'),
  Coupon: require('./Coupon'),
  ShippingOption: require('./ShippingOption'),
  Banner: require('./Banner'),
  HomeSection: require('./HomeSection'),
  NavMenu: require('./NavMenu'),
  Settings: require('./Settings'),
  Role: require('./Role'),
  User: require('./User'),
  Order: require('./Order'),
};
