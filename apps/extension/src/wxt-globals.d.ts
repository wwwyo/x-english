declare function defineBackground(main: () => void): unknown;

declare function defineContentScript(config: {
  matches: string[];
  runAt?: "document_start" | "document_end" | "document_idle";
  main: () => void;
}): unknown;
