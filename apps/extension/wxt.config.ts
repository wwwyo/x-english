import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "xEnglish",
    description: "Xでつい無駄に感じてしまう時間を、有意義な英語学習の時間に変える拡張機能です。",
    permissions: ["storage"],
    host_permissions: ["https://x.com/*", "https://twitter.com/*"],
    background: {
      service_worker: "background.js",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
  },
});
