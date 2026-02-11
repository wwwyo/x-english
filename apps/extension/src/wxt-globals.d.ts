interface ImportMetaEnv {
  readonly VITE_WORKER_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare function defineBackground(main: () => void): unknown;

declare function defineContentScript(config: {
  matches: string[];
  runAt?: "document_start" | "document_end" | "document_idle";
  main: () => void;
}): unknown;
