const mongoose = require('mongoose');
const serialise = require('./plugins/serialise');
const { isValidPermission, SUPER } = require('../config/permissions');

/**
 * A named permission set. Modelled explicitly rather than as an enum on User
 * because "Roles & Permissions" is a management screen — an admin needs to be
 * able to create a role the code has never heard of.
 */
const RoleSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 60 },
    slug: { type: String, trim: true, lowercase: true, required: true, unique: true, index: true },
    description: { type: String, trim: true, default: '', maxlength: 300 },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.every(isValidPermission),
        message: (props) =>
          `Unknown permission(s): ${props.value.filter((p) => !isValidPermission(p)).join(', ')}`,
      },
    },
    /** Seeded roles the admin panel must not delete. */
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

serialise(RoleSchema);

RoleSchema.methods.can = function can(permission) {
  return this.permissions.includes(SUPER) || this.permissions.includes(permission);
};

/** Anything beyond an empty permission list means this role can reach the admin panel. */
RoleSchema.virtual('isStaff').get(function isStaff() {
  return this.permissions.length > 0;
});

module.exports = mongoose.model('Role', RoleSchema);
