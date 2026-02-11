export const DEFAULT_MODEL = "gpt-5-nano";
export const SYSTEM_DAILY_LIMIT = 50;
export const SYSTEM_DAILY_IP_LIMIT = 200;

export type Chunk = {
  text: string;
  ja: string;
};

export type ProcessResult = {
  englishText: string;
  chunks: Chunk[];
};

export type AskResult = {
  answer: string;
};

export type AskPayload = {
  englishText: string;
  chunkText: string;
  question: string;
};

export type WorkerErrorCode =
  | "RATE_LIMIT_EXCEEDED"
  | "BAD_REQUEST"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export type WorkerErrorBody = {
  code: WorkerErrorCode;
  message: string;
  remaining?: number;
  limit?: number;
};
