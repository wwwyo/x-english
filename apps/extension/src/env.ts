if (!import.meta.env.VITE_WORKER_BASE_URL) {
  throw new Error("VITE_WORKER_BASE_URL is not set");
}

export const DEFAULT_WORKER_BASE_URL = import.meta.env.VITE_WORKER_BASE_URL;
