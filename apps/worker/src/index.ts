import { getApp } from "./app";
import type { WorkerEnv } from "./types";
export { RateLimitDurableObject } from "./durable-objects/rate-limit-do";

export default {
  fetch(request: Request, env: WorkerEnv): Response | Promise<Response> {
    return getApp(env).fetch(request);
  },
};
