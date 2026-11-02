/** Drop raw SSN values before anything is written to browser storage. */
export function sanitizeStoredUser<T extends { payee?: { ssn?: string | null } | null }>(
  user: T,
): T {
  if (!user?.payee) return user;
  const ssnOnFile = Boolean(user.payee.ssn);
  const { ssn: _ssn, ...payee } = user.payee;
  return {
    ...user,
    payee: { ...payee, ssnOnFile },
  };
}
