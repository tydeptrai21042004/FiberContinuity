export class ContinuityError extends Error {
  readonly code: string;
  readonly recoveryUnsafe: boolean;

  constructor(code: string, message: string, recoveryUnsafe = false) {
    super(message);
    this.name = "ContinuityError";
    this.code = code;
    this.recoveryUnsafe = recoveryUnsafe;
  }
}

export class UnsupportedCapabilityError extends ContinuityError {
  constructor(message: string) {
    super("UNSUPPORTED_CAPABILITY", message);
  }
}
