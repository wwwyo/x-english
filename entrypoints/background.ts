import {
  DEFAULT_MODEL,
  type AskPayload,
  type AskResult,
  type Chunk,
  type ProcessResult,
  type RuntimeError,
  type RuntimeResponse,
  isRuntimeMessage
} from "../src/shared/messages";

type StoredSettings = {
  apiKey: string;
  model: string;
};

const PROCESS_CACHE = new Map<string, ProcessResult>();
const ANSWER_CACHE = new Map<string, AskResult>();

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: RuntimeResponse<ProcessResult | AskResult>) => void
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
    }
  );
});

async function processTweet(rawText: string): Promise<ProcessResult> {
  const text = normalizeWhitespace(rawText);
  if (!text) {
    return {
      englishText: "",
      chunks: []
    };
  }

  const cacheKey = hashString(`process::${text}`);
  const cached = PROCESS_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const settings = await loadSettings();
  const content = await askOpenAI({
    apiKey: settings.apiKey,
    model: settings.model,
    systemPrompt: "You are a careful English tutor. Follow the user's output contract exactly.",
    userPrompt: buildProcessPrompt(text),
    responseType: "json_object"
  });

  const parsed = safeParseJson(content) as {
    english_text?: string;
    chunks?: Array<{ text?: string; ja?: string }>;
  };

  const englishText = normalizeWhitespace(parsed.english_text || text);
  const chunks = sanitizeChunks(parsed.chunks, englishText);

  const result: ProcessResult = {
    englishText,
    chunks
  };
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
  const answer = await askOpenAI({
    apiKey: settings.apiKey,
    model: settings.model,
    systemPrompt:
      "You are an English tutor for Japanese learners. Answer in Japanese, concise but clear. If the question asks meaning, explain nuance and one simple example.",
    userPrompt: buildQuestionPrompt({
      englishText,
      chunkText,
      question
    })
  });

  const result: AskResult = { answer: normalizeWhitespace(answer) };
  ANSWER_CACHE.set(cacheKey, result);
  return result;
}

function buildProcessPrompt(text: string): string {
  return [
    "Task:",
    "1) If the input is not English, translate the full text into natural English.",
    "2) If the input is already English, keep the wording as-is unless tiny spacing cleanup is needed.",
    "3) Split the final English text into medium-grained semantic chunks.",
    "",
    "Chunk rules:",
    "- Each chunk should represent one meaningful unit.",
    "- Keep subject + predicate together.",
    "- Keep phrasal verbs as one unit.",
    "- Do NOT split into individual words.",
    "- Separate major adjuncts (e.g., prepositional phrases, participle phrases, condition clauses).",
    "",
    "Also provide Japanese gloss for each chunk.",
    "",
    "Return JSON only with this shape:",
    '{"english_text":"...", "chunks":[{"text":"...", "ja":"..."}]}',
    "",
    "Input text:",
    text
  ].join("\n");
}

function buildQuestionPrompt(payload: AskPayload): string {
  return [
    "以下の英文の文脈に基づいて質問に答えてください。",
    "",
    `英文: ${payload.englishText}`,
    `対象チャンク: ${payload.chunkText || "N/A"}`,
    `質問: ${payload.question}`,
    "",
    "日本語で回答し、必要なら以下も補足してください:",
    "- ニュアンス",
    "- 似た表現との違い",
    "- 1つの短い例文"
  ].join("\n");
}

async function askOpenAI(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  responseType?: "json_object";
}): Promise<string> {
  if (!input.apiKey) {
    throw new Error("OpenAI APIキーが未設定です。Optionsで設定してください。");
  }

  const body: {
    model: string;
    messages: Array<{ role: "system" | "user"; content: string }>;
    temperature: number;
    response_format?: { type: "json_object" };
  } = {
    model: input.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt }
    ],
    temperature: 0.2
  };

  if (input.responseType === "json_object") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`OpenAI APIエラー (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI APIの応答が空です。");
  }
  return content;
}

async function loadSettings(): Promise<StoredSettings> {
  const values = (await chrome.storage.local.get([
    "openaiApiKey",
    "openaiModel"
  ])) as { openaiApiKey?: string; openaiModel?: string };

  return {
    apiKey: values.openaiApiKey || "",
    model: values.openaiModel || DEFAULT_MODEL
  };
}

function sanitizeChunks(
  rawChunks: Array<{ text?: string; ja?: string }> | undefined,
  fallbackText: string
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
      ja: normalizeWhitespace(raw.ja || "") || "（意味の取得に失敗）"
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
      stack: error.stack
    };
  }
  return { message: "不明なエラー" };
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
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
