const { z, objectId, address } = require('./common');
const { ALL_PERMISSIONS, SUPER } = require('../config/permissions');

/**
 * A minimum length and nothing else. Composition rules (one uppercase, one
 * symbol) measurably push people toward `Password1!` — length is the property
 * that actually matters.
 */
const password = z.string().min(8, 'Use at least 8 characters').max(200);

const register = z.object({
  firstName: z.string().trim().min(1, 'Tell us your first name').max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z.email('Enter a valid email address'),
  phone: z.string().trim().max(40).optional(),
  password,
});

const login = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const forgotPassword = z.object({ email: z.email('Enter a valid email address') });

const resetPassword = z.object({
  token: z.string().trim().min(1),
  password,
});

const verifyOtp = z.object({
  email: z.email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

const updateProfile = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(40).optional(),
});

const upsertAddress = address;

const createRole = z.object({
  name: z.string().trim().min(1).max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().trim().max(300).optional(),
  permissions: z
    .array(z.string())
    .refine((list) => list.every((p) => p === SUPER || ALL_PERMISSIONS.includes(p)), {
      message: 'Contains an unknown permission',
    })
    .optional(),
});

/** Admin creating or editing a staff account. */
const createStaff = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).optional(),
  email: z.email(),
  phone: z.string().trim().max(40).optional(),
  password,
  role: objectId,
});

const updateUser = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  phone: z.string().trim().max(40).optional(),
  role: objectId.optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyOtp,
  changePassword,
  updateProfile,
  upsertAddress,
  createRole,
  updateRole: createRole.partial(),
  createStaff,
  updateUser,
};
