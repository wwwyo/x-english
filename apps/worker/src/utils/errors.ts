import type { WorkerErrorBody, WorkerErrorCode } from "../contracts";

export class ApiError extends Error {
  constructor(
    public readonly code: WorkerErrorCode,
    message: string,
    public readonly status: number,
    public readonly extra?: {
      remaining?: number;
      limit?: number;
    },
  ) {
    super(message);
  }
}

export function toErrorBody(error: ApiError): WorkerErrorBody {
  return {
    code: error.code,
    message: error.message,
    ...error.extra,
  };
}
