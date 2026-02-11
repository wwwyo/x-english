import { SYSTEM_DAILY_IP_LIMIT, SYSTEM_DAILY_LIMIT } from "../contracts";
import { workerEnv } from "../env";
import { ApiError } from "../utils/errors";
import { normalizeWhitespace } from "../utils/text";

export async function resolveApiKey(headers: Record<string, string | undefined>): Promise<string> {
  const byok = normalizeWhitespace(headers["x-byok-key"] || "");
  if (byok) {
    return byok;
  }

  const clientId = normalizeWhitespace(headers["x-client-id"] || "");
  if (!clientId) {
    throw new ApiError("BAD_REQUEST", "x-client-id ヘッダが必要です。", 400);
  }

  const providerKey = workerEnv.OPENAI_API_KEY;

  const ip = getClientIp(headers);
  const day = new Date().toISOString().slice(0, 10);

  const ipHash = await sha256Hex(`${workerEnv.RATE_LIMIT_SALT || ""}:ip:${ip}`);
  const clientHash = await sha256Hex(`${workerEnv.RATE_LIMIT_SALT || ""}:client:${clientId}`);
  await consumeDailyRateLimit({
    day,
    ipHash,
    clientHash,
  });

  return providerKey;
}

async function consumeDailyRateLimit(input: {
  day: string;
  ipHash: string;
  clientHash: string;
}): Promise<void> {
  const doId = workerEnv.RATE_LIMITER.idFromName(`rate:${input.day}:${input.ipHash}`);
  const stub = workerEnv.RATE_LIMITER.get(doId);

  const response = await stub.fetch("https://rate-limit/consume", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      day: input.day,
      clientHash: input.clientHash,
      pairLimit: SYSTEM_DAILY_LIMIT,
      ipLimit: SYSTEM_DAILY_IP_LIMIT,
    }),
  });

  if (!response.ok) {
    throw new ApiError("RATE_LIMIT_EXCEEDED", "1日のシステム利用上限に達しました。", 429, {
      remaining: 0,
      limit: SYSTEM_DAILY_LIMIT,
    });
  }
}

function getClientIp(headers: Record<string, string | undefined>): string {
  const candidates = [
    headers["cf-connecting-ip"],
    headers["x-forwarded-for"]?.split(",")[0],
    headers["x-real-ip"],
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWhitespace(candidate || "");
    if (normalized) {
      return normalized;
    }
  }

  return "unknown";
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hashBytes = Array.from(new Uint8Array(digest));
  return hashBytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
