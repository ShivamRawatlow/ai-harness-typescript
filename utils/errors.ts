export class AgentError extends Error {
  readonly details: Record<string, unknown>;
  readonly cause: Error | undefined;

  constructor(
    message: string,
    details?: Record<string, unknown>,
    cause?: Error,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.details = details ?? {};
    this.cause = cause;
  }

  toString(): string {
    let base = this.message;

    if (Object.keys(this.details).length > 0) {
      const detailStr = Object.entries(this.details)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      base = `${base} (${detailStr})`;
    }

    if (this.cause) {
      base = `${base} [caused by: ${this.cause}]`;
    }

    return base;
  }

  toDict(): Record<string, unknown> {
    return {
      type: this.name,
      message: this.message,
      details: this.details,
      cause: this.cause ? String(this.cause) : null,
    };
  }
}

export class ConfigError extends AgentError {
  readonly configKey: string | undefined;
  readonly configFile: string | undefined;

  constructor(
    message: string,
    options?: {
      configKey?: string;
      configFile?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    },
  ) {
    const details: Record<string, unknown> = { ...options?.details };
    if (options?.configKey) details["configKey"] = options.configKey;
    if (options?.configFile) details["configFile"] = options.configFile;

    super(message, details, options?.cause);
    this.configKey = options?.configKey;
    this.configFile = options?.configFile;
  }
}
