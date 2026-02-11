type ConsumeRequest = {
  day: string;
  clientHash: string;
  pairLimit: number;
  ipLimit: number;
};

type ConsumeResponse =
  | {
      pairUsed: number;
      pairRemaining: number;
      ipUsed: number;
      ipRemaining: number;
    }
  | {
      reason: "pair_limit" | "ip_limit";
      pairRemaining: number;
      ipRemaining: number;
    };

export class RateLimitDurableObject implements DurableObject {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      console.info(`[RateLimitDO] Method not allowed: ${request.method}`);
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    let body: Partial<ConsumeRequest>;
    try {
      body = (await request.json()) as Partial<ConsumeRequest>;
    } catch (error) {
      console.info("[RateLimitDO] Failed to parse request body:", error);
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    const day = normalizeDay(body.day);
    const clientHash = normalizeHash(body.clientHash);
    const pairLimit = normalizePositiveInt(body.pairLimit);
    const ipLimit = normalizePositiveInt(body.ipLimit);

    if (!day || !clientHash || pairLimit <= 0 || ipLimit <= 0) {
      console.info(
        `[RateLimitDO] Invalid params: day=${body.day} clientHash=${body.clientHash ? "[set]" : "[empty]"} pairLimit=${body.pairLimit} ipLimit=${body.ipLimit}`,
      );
      return Response.json({ error: "bad_request" }, { status: 400 });
    }

    const ipKey = `rate:${day}:ip`;
    const pairKey = `rate:${day}:pair:${clientHash}`;

    const [ipCurrentRaw, pairCurrentRaw] = await Promise.all([
      this.state.storage.get<number>(ipKey),
      this.state.storage.get<number>(pairKey),
    ]);

    const ipCurrent = Number(ipCurrentRaw || 0);
    const pairCurrent = Number(pairCurrentRaw || 0);

    if (ipCurrent >= ipLimit) {
      console.warn(`[RateLimitDO] IP limit exceeded: current=${ipCurrent} limit=${ipLimit}`);
      const response: ConsumeResponse = {
        reason: "ip_limit",
        pairRemaining: Math.max(pairLimit - pairCurrent, 0),
        ipRemaining: 0,
      };
      return Response.json(response, { status: 429 });
    }

    if (pairCurrent >= pairLimit) {
      console.warn(`[RateLimitDO] Pair limit exceeded: current=${pairCurrent} limit=${pairLimit}`);
      const response: ConsumeResponse = {
        reason: "pair_limit",
        pairRemaining: 0,
        ipRemaining: Math.max(ipLimit - ipCurrent, 0),
      };
      return Response.json(response, { status: 429 });
    }

    const ipNext = ipCurrent + 1;
    const pairNext = pairCurrent + 1;

    await Promise.all([
      this.state.storage.put(ipKey, ipNext),
      this.state.storage.put(pairKey, pairNext),
    ]);

    const success: ConsumeResponse = {
      pairUsed: pairNext,
      pairRemaining: Math.max(pairLimit - pairNext, 0),
      ipUsed: ipNext,
      ipRemaining: Math.max(ipLimit - ipNext, 0),
    };
    return Response.json(success, { status: 200 });
  }
}

function normalizeDay(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeHash(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function normalizePositiveInt(value: unknown): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return 0;
  }
  return number;
}
