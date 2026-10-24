/**
 * What other people may see of a user (project members, comment authors).
 * An allowlist: columns added to the User model stay private until someone
 * adds them here on purpose (user-select.spec.ts enforces the decision).
 */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarId: true,
  createdAt: true,
} as const;

/** The signed-in user's own profile: the public fields plus account state. */
export const USER_PROFILE_SELECT = {
  ...USER_PUBLIC_SELECT,
  emailVerifiedAt: true,
} as const;
