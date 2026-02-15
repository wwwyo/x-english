import { loadEnv } from "vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  manifest: ({ mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const workerBaseUrl = env.VITE_WORKER_BASE_URL;
    const workerHost = `${new URL(workerBaseUrl).origin}/*`;

    return {
      name: "xEnglish",
      description: "Xでつい無駄に感じてしまう時間を、有意義な英語学習の時間に変える拡張機能です。",
      permissions: ["storage"],
      host_permissions: [workerHost],
      background: {
        service_worker: "background.js",
      },
    };
  },
});
