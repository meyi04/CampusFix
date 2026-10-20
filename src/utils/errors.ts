export function getUserFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;

  if (/query requires an index/i.test(error.message)) {
    return 'This view needs a Firestore index. Deploy the project indexes and wait for them to finish building.';
  }

  return error.message || fallback;
}

export function toUserFacingError(error: unknown, fallback: string): Error {
  return new Error(getUserFacingError(error, fallback));
}
