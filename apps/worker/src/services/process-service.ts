import { createOpenAI, OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { t, type Static } from "elysia";
import { jsonSchema, NoOutputGeneratedError, Output, generateText } from "ai";
import { DEFAULT_MODEL, type ProcessResult } from "../contracts";
import { ApiError } from "../utils/errors";
import { normalizeWhitespace } from "../utils/text";

export const processBodySchema = t.Object({
  text: t.String(),
  model: t.Optional(t.String()),
});

type ProcessBody = Static<typeof processBodySchema>;

const processOutputSchema = t.Object(
  {
    english_text: t.String({ minLength: 1 }),
    chunks: t.Array(
      t.Object(
        {
          text: t.String({ minLength: 1 }),
          ja: t.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
);

type ProcessOutput = Static<typeof processOutputSchema>;

export async function processTweet(input: {
  apiKey: string;
  body: ProcessBody;
}): Promise<ProcessResult> {
  const apiKey = input.apiKey;

  const openai = createOpenAI({ apiKey });
  const model = normalizeWhitespace(input.body.model || DEFAULT_MODEL);
  const normalizedText = normalizeWhitespace(input.body.text);

  if (!normalizedText) {
    console.info("[processTweet] Empty text received");
    throw new ApiError("BAD_REQUEST", "text が空です。", 400);
  }

  const object = await generateProcessOutput({
    model: openai(model),
    prompt: buildProcessPrompt(normalizedText),
  });

  return {
    englishText: normalizeWhitespace(object.english_text),
    chunks: sanitizeChunks(object.chunks),
  };
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
    "- Preserve line breaks (\\n) from the original text. Place them at the end of the chunk that precedes the break.",
    "- Keep hashtags (#word) and URLs (https://...) exactly as-is without translating or modifying them.",
    "",
    "Also provide Japanese gloss for each chunk.",
    "",
    "Input text:",
    text,
  ].join("\n");
}

async function generateProcessOutput(input: {
  model: ReturnType<ReturnType<typeof createOpenAI>>;
  prompt: string;
}): Promise<ProcessOutput> {
  try {
    const { output } = await generateText({
      model: input.model,
      system: "You are a careful English tutor. Follow the user's output contract exactly.",
      prompt: input.prompt,
      providerOptions: {
        openai: {
          reasoningEffort: "minimal",
        } satisfies OpenAIResponsesProviderOptions,
      },
      output: Output.object({
        schema: jsonSchema(processOutputSchema),
      }),
    });

    return output as ProcessOutput;
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      console.error("[generateProcessOutput] No output generated from LLM:", error);
      throw new ApiError("UPSTREAM_ERROR", "構造化出力の生成に失敗しました。", 502);
    }
    console.error("[generateProcessOutput] LLM call failed:", error);
    throw error;
  }
}

function sanitizeChunks(
  chunks: Array<{
    text: string;
    ja: string;
  }>,
): ProcessResult["chunks"] {
  const normalized = chunks
    .map((chunk) => ({
      text: normalizeWhitespace(chunk.text),
      ja: normalizeWhitespace(chunk.ja),
    }))
    .filter((chunk) => chunk.text.length > 0);

  if (normalized.length === 0) {
    return [{ text: "(empty)", ja: "（意味の取得に失敗）" }];
  }
  return normalized;
}
