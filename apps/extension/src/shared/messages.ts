import type { AskPayload, AskResult, ProcessResult } from "@xenglish/worker/contracts";

export type RuntimeError = {
  message: string;
  stack?: string;
};

export type ProcessMessage = {
  type: "XENGLISH_PROCESS_TWEET";
  text: string;
};

export type AskMessage = {
  type: "XENGLISH_ASK_QUESTION";
  payload: AskPayload;
};

export type RuntimeMessage = ProcessMessage | AskMessage;

export type RuntimeResponse<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: RuntimeError;
    };

export type { AskPayload, AskResult, ProcessResult };

export function isRuntimeMessage(input: unknown): input is RuntimeMessage {
  if (!input || typeof input !== "object") {
    return false;
  }
  const message = input as Partial<RuntimeMessage>;
  return message.type === "XENGLISH_PROCESS_TWEET" || message.type === "XENGLISH_ASK_QUESTION";
}
