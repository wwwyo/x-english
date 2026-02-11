import { env } from "cloudflare:workers";

type Bindings = {
  OPENAI_API_KEY: string;
  RATE_LIMIT_SALT: string;
  RATE_LIMITER: DurableObjectNamespace;
};

function validateEnv(e: Record<string, unknown>): asserts e is Bindings {
  const required = ["OPENAI_API_KEY", "RATE_LIMIT_SALT", "RATE_LIMITER"] as const;
  for (const key of required) {
    const val = e[key];
    if (key === "RATE_LIMITER") {
      if (!val) throw new Error(`Missing env: ${key}`);
    } else {
      if (typeof val !== "string" || val.length === 0)
        throw new Error(`Missing or empty env: ${key}`);
    }
  }
}

const workerEnvUnchecked = env as Record<string, unknown>;
validateEnv(workerEnvUnchecked);

export const workerEnv = workerEnvUnchecked;
