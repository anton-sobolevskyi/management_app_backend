/** Emails are case-insensitive in practice; store and compare them trimmed + lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
