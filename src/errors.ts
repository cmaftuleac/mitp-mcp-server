/** Thrown when the session is missing/expired and the user must re-run `npm run login`. */
export class MitpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MitpAuthError";
  }
}

/** Thrown for non-auth API failures (bad status, invalid JSON, network). */
export class MitpApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "MitpApiError";
  }
}
