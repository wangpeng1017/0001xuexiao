export interface ApiSuccess<T> {
  code: 200;
  msg: string;
  data: T;
  [key: string]: unknown;
}

export interface ApiFailure {
  code: number;
  msg: string;
}

export class BizError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'BizError';
    this.code = code;
  }
}

export function ok<T>(data: T, extra?: Record<string, unknown>): ApiSuccess<T> {
  return { ...(extra ?? {}), code: 200, msg: 'ok', data };
}

export function fail(code: number, msg: string): ApiFailure {
  return { code, msg };
}
