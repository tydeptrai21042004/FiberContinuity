export class ContinuityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContinuityError";
    this.code = code;
  }
}

export class UnsupportedCapabilityError extends ContinuityError {
  constructor(message: string) {
    super("UNSUPPORTED_CAPABILITY", message);
  }
}
