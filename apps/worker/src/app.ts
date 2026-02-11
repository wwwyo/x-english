import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { resolveApiKey } from "./services/auth-service";
import { answerQuestion, askBodySchema } from "./services/ask-service";
import { processTweet, processBodySchema } from "./services/process-service";
import { ApiError, toErrorBody } from "./utils/errors";

export const app = new Elysia({
  adapter: CloudflareAdapter,
})
  .use(
    cors({
      origin: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["content-type", "x-client-id", "x-byok-key"],
    }),
  )
  .onError(({ error, set }) => {
    if (error instanceof ApiError) {
      if (error.status >= 500) {
        console.error(`[onError] ApiError: status=${error.status} code=${error.code} message=${error.message}`, error.extra ?? "");
      }
      set.status = error.status;
      return toErrorBody(error);
    }
    console.error("[onError] Unhandled:", error);
    set.status = 500;
    return { code: "INTERNAL_ERROR", message: String(error) };
  })
  .get("/health", () => ({ ok: true }))
  .derive(async ({ headers }) => ({
    apiKey: await resolveApiKey(headers),
  }))
  .post(
    "/v1/process",
    async ({ body, apiKey }) => {
      return processTweet({ apiKey, body });
    },
    { body: processBodySchema },
  )
  .post(
    "/v1/ask",
    async ({ body, apiKey }) => {
      return answerQuestion({ apiKey, body });
    },
    { body: askBodySchema },
  )
  .compile();

export type App = typeof app;
