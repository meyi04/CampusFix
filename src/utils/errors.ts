export function isPermissionDeniedError(error: unknown): boolean {
  const hasPermissionDeniedCode = typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'permission-denied';
  const message = error instanceof Error ? error.message : '';

  return hasPermissionDeniedCode || /missing or insufficient permissions|permission-denied/i.test(message);
}

export function getUserFacingError(error: unknown, fallback: string): string {
  if (isPermissionDeniedError(error)) {
    return 'CampusFix could not access this Firestore data for your account. Ask a project administrator to verify the Firebase project and publish the current Firestore rules.';
  }

  if (!(error instanceof Error)) return fallback;

  if (/query requires an index/i.test(error.message)) {
    return 'This view needs a Firestore index. Deploy the project indexes and wait for them to finish building.';
  }

  return error.message || fallback;
}

export function toUserFacingError(error: unknown, fallback: string): Error {
  return new Error(getUserFacingError(error, fallback));
}
