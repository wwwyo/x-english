export const DEFAULT_MODEL = "gpt-4.1-mini";

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

export type ProcessMessage = {
  type: "XENGLISH_PROCESS_TWEET";
  text: string;
};

export type AskPayload = {
  englishText: string;
  chunkText: string;
  question: string;
};

export type AskMessage = {
  type: "XENGLISH_ASK_QUESTION";
  payload: AskPayload;
};

export type RuntimeMessage = ProcessMessage | AskMessage;

export type RuntimeError = {
  message: string;
  stack?: string;
};

export type RuntimeResponse<T> =
  | {
      ok: true;
      result: T;
    }
  | {
      ok: false;
      error: RuntimeError;
    };

export function isRuntimeMessage(input: unknown): input is RuntimeMessage {
  if (!input || typeof input !== "object") {
    return false;
  }
  const message = input as Partial<RuntimeMessage>;
  return (
    message.type === "XENGLISH_PROCESS_TWEET" ||
    message.type === "XENGLISH_ASK_QUESTION"
  );
}
