import { app } from "./app";
export { RateLimitDurableObject } from "./durable-objects/rate-limit-do";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return app.fetch(request);
  },
};
