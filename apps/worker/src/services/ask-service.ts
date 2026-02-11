import { createOpenAI, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { t, type Static } from "elysia";
import { generateText } from "ai";
import { DEFAULT_MODEL, type AskPayload, type AskResult } from "../contracts";
import { ApiError } from "../utils/errors";
import { normalizeWhitespace } from "../utils/text";

export const askBodySchema = t.Object({
  payload: t.Object({
    englishText: t.String(),
    chunkText: t.String(),
    question: t.String(),
  }),
  model: t.Optional(t.String()),
});

type AskBody = Static<typeof askBodySchema>;

export async function answerQuestion(input: {
  apiKey: string;
  body: AskBody;
}): Promise<AskResult> {
  const apiKey = input.apiKey;

  const openai = createOpenAI({ apiKey });
  const model = normalizeWhitespace(input.body.model || DEFAULT_MODEL);
  const payload = input.body.payload;

  if (!normalizeWhitespace(payload.englishText) || !normalizeWhitespace(payload.question)) {
    console.info("[answerQuestion] Missing required fields: englishText or question is empty");
    throw new ApiError("BAD_REQUEST", "質問に必要な情報が不足しています。", 400);
  }

  try {
    const { text } = await generateText({
      model: openai(model),
      temperature: 0.2,
      system:
        "You are an English tutor for Japanese learners. Answer in Japanese, concise but clear. If the question asks meaning, explain nuance and one simple example.",
      prompt: buildQuestionPrompt(payload),
      providerOptions: {
        openai: {
          reasoningEffort: 'minimal',
        } satisfies OpenAIResponsesProviderOptions,
      },
    });

    return {
      answer: normalizeWhitespace(text),
    };
  } catch (error) {
    console.error("[answerQuestion] LLM call failed:", error);
    throw error;
  }
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
    "- 1つの短い例文",
  ].join("\n");
}
