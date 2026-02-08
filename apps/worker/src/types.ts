type RateLimitDoId = unknown;

type RateLimitDoStub = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type RateLimitDoNamespace = {
  idFromName(name: string): RateLimitDoId;
  get(id: RateLimitDoId): RateLimitDoStub;
};

export type WorkerEnv = {
  OPENAI_API_KEY: string;
  DEFAULT_MODEL?: string;
  RATE_LIMITER: RateLimitDoNamespace;
  RATE_LIMIT_SALT?: string;
};

export type RequestHeaders = Record<string, string | undefined>;
