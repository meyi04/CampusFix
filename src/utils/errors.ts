export function getUserFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  if (/query requires an index/i.test(error.message)) {
    return 'This view needs a Firestore index. Deploy the project indexes and wait for them to finish building.';
  }

  if (/missing or insufficient permissions/i.test(error.message)) {
    return 'This Firebase project is blocking access for this account. Confirm the app is using the correct project and the deployed Firestore rules allow this role.';
  }

  return error.message || fallback;
}

export function toUserFacingError(error: unknown, fallback: string): Error {
  return new Error(getUserFacingError(error, fallback));
}
