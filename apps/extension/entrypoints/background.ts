import { edenTreaty } from "@elysiajs/eden";
import type { App } from "@xenglish/worker/app";
import {
  DEFAULT_MODEL,
  SYSTEM_DAILY_LIMIT,
  type Chunk,
  type WorkerErrorBody,
} from "@xenglish/worker/contracts";
import { DEFAULT_WORKER_BASE_URL } from "../src/env";
import {
  isRuntimeMessage,
  type AskPayload,
  type AskResult,
  type ProcessResult,
  type RuntimeError,
  type RuntimeResponse,
} from "../src/shared/messages";

type StoredSettings = {
  apiKey: string;
  model: string;
  workerBaseUrl: string;
  clientId: string;
};

const PROCESS_CACHE = new Map<string, ProcessResult>();
const ANSWER_CACHE = new Map<string, AskResult>();

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: RuntimeResponse<ProcessResult | AskResult>) => void,
    ) => {
      if (!isRuntimeMessage(message)) {
        return false;
      }

      if (message.type === "XENGLISH_PROCESS_TWEET") {
        processTweet(message.text)
          .then((result) => {
            sendResponse({ ok: true, result });
          })
          .catch((error: unknown) => {
            sendResponse({ ok: false, error: toSafeError(error) });
          });
        return true;
      }

      answerQuestion(message.payload)
        .then((result) => {
          sendResponse({ ok: true, result });
        })
        .catch((error: unknown) => {
          sendResponse({ ok: false, error: toSafeError(error) });
        });
      return true;
    },
  );
});

async function processTweet(rawText: string): Promise<ProcessResult> {
  const text = normalizeWhitespace(rawText);
  if (!text) {
    return {
      englishText: "",
      chunks: [],
    };
  }

  const cacheKey = hashString(`process::${text}`);
  const cached = PROCESS_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const settings = await loadSettings();
  const result = await callProcessApi({
    settings,
    text,
  });
  PROCESS_CACHE.set(cacheKey, result);
  return result;
}

async function answerQuestion(payload: AskPayload): Promise<AskResult> {
  const englishText = normalizeWhitespace(payload.englishText);
  const chunkText = normalizeWhitespace(payload.chunkText);
  const question = normalizeWhitespace(payload.question);

  if (!englishText || !question) {
    throw new Error("質問に必要な情報が不足しています。");
  }

  const cacheKey = hashString(`ask::${englishText}::${chunkText}::${question}`);
  const cached = ANSWER_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const settings = await loadSettings();
  const result = await callAskApi({
    settings,
    payload: {
      englishText,
      chunkText,
      question,
    },
  });
  ANSWER_CACHE.set(cacheKey, result);
  return result;
}

async function callProcessApi(input: {
  settings: StoredSettings;
  text: string;
}): Promise<ProcessResult> {
  const client = createWorkerClient(input.settings);
  const response = await client.v1.process.post({
    text: input.text,
    model: input.settings.model,
    $headers: buildWorkerHeaders(input.settings),
  });
  const data = unwrapWorkerResponse<ProcessResult>(response);
  return {
    englishText: normalizeWhitespace(data.englishText),
    chunks: sanitizeChunks(data.chunks, input.text),
  };
}

async function callAskApi(input: {
  settings: StoredSettings;
  payload: AskPayload;
}): Promise<AskResult> {
  const client = createWorkerClient(input.settings);
  const response = await client.v1.ask.post({
    payload: input.payload,
    model: input.settings.model,
    $headers: buildWorkerHeaders(input.settings),
  });
  const data = unwrapWorkerResponse<AskResult>(response);
  return {
    answer: normalizeWhitespace(data.answer),
  };
}

function createWorkerClient(settings: StoredSettings) {
  return edenTreaty<App>(settings.workerBaseUrl);
}

function buildWorkerHeaders(settings: StoredSettings): Record<string, string> {
  return {
    "x-client-id": settings.clientId,
    // NOTE: BYOKはクライアント保存されたキーを送るため、セキュリティ上は非推奨。
    ...(settings.apiKey ? { "x-byok-key": settings.apiKey } : {}),
  };
}

function unwrapWorkerResponse<T>(response: {
  data: T | WorkerErrorBody | null;
  error: {
    status: number;
    value: unknown;
  } | null;
}): T {
  if (response.error) {
    throw new Error(getWorkerErrorMessage(response.error.status, response.error.value));
  }

  if (!response.data) {
    throw new Error("xEnglish APIエラー: レスポンスが空です。");
  }

  if (isWorkerErrorBody(response.data)) {
    throw new Error(getWorkerErrorMessage(500, response.data));
  }
  return response.data;
}

function getWorkerErrorMessage(status: number, error: unknown): string {
  if (status === 429 && isRateLimitError(error)) {
    return `本日のシステム利用上限(${SYSTEM_DAILY_LIMIT}件)に達しました。OptionsでBYOKを設定してください。`;
  }

  if (isWorkerErrorBody(error)) {
    return error.message || "xEnglish APIエラー";
  }
  return `xEnglish APIエラー (${status})`;
}

function isWorkerErrorBody(error: unknown): error is WorkerErrorBody {
  if (!error || typeof error !== "object") {
    return false;
  }
  const value = error as Partial<WorkerErrorBody>;
  return typeof value.code === "string";
}

function isRateLimitError(error: unknown): boolean {
  return isWorkerErrorBody(error) && error.code === "RATE_LIMIT_EXCEEDED";
}

async function loadSettings(): Promise<StoredSettings> {
  const values = (await chrome.storage.local.get([
    "openaiApiKey",
    "openaiModel",
    "xenglishWorkerBaseUrl",
    "xenglishClientId",
  ])) as {
    openaiApiKey?: string;
    openaiModel?: string;
    xenglishWorkerBaseUrl?: string;
    xenglishClientId?: string;
  };

  const existingClientId = values.xenglishClientId;
  const clientId = existingClientId || crypto.randomUUID();
  if (!existingClientId) {
    await chrome.storage.local.set({ xenglishClientId: clientId });
  }

  return {
    apiKey: values.openaiApiKey || "",
    model: values.openaiModel || DEFAULT_MODEL,
    workerBaseUrl: normalizeBaseUrl(values.xenglishWorkerBaseUrl || DEFAULT_WORKER_BASE_URL),
    clientId,
  };
}

function sanitizeChunks(
  rawChunks: Array<{ text?: string; ja?: string }> | undefined,
  fallbackText: string,
): Chunk[] {
  if (!rawChunks || rawChunks.length === 0) {
    return [{ text: fallbackText, ja: "（意味の取得に失敗）" }];
  }

  const chunks: Chunk[] = [];
  for (const raw of rawChunks) {
    const text = normalizeWhitespace(raw.text || "");
    if (!text) {
      continue;
    }
    chunks.push({
      text,
      ja: normalizeWhitespace(raw.ja || "") || "（意味の取得に失敗）",
    });
  }

  if (chunks.length === 0) {
    return [{ text: fallbackText, ja: "（意味の取得に失敗）" }];
  }
  return chunks;
}

function toSafeError(error: unknown): RuntimeError {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: "不明なエラー" };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/g, "");
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hashString(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}
