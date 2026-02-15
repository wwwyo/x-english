import "../src/styles/content.css";
import type {
  AskResult,
  ProcessResult,
  RuntimeMessage,
  RuntimeResponse,
} from "../src/shared/messages";

const PROCESSED_ATTR = "data-xenglish-processed";
const IN_FLIGHT_ATTR = "data-xenglish-in-flight";
const ERROR_ATTR = "data-xenglish-error";
const LOADING_CLASS = "xenglish-loading";
const TARGET_SELECTOR = 'article [data-testid="tweetText"]';

const processingQueue: HTMLElement[] = [];
const inFlightSet = new WeakSet<HTMLElement>();
let queueBusy = false;

export default defineContentScript({
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_idle",
  main() {
    console.log("hello");
    initContentScript();
  },
});

function initContentScript(): void {
  const observer = new MutationObserver(() => {
    scanAndEnqueue();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scanAndEnqueue();
}

function scanAndEnqueue(): void {
  const nodes = document.querySelectorAll(TARGET_SELECTOR);
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (inFlightSet.has(node)) {
      continue;
    }
    if (isStillProcessed(node)) {
      continue;
    }

    // Clean up any stale state from a previous processing cycle
    node.removeAttribute(PROCESSED_ATTR);
    node.removeAttribute(IN_FLIGHT_ATTR);
    node.removeAttribute(ERROR_ATTR);
    node.classList.remove(LOADING_CLASS);

    inFlightSet.add(node);
    node.setAttribute(IN_FLIGHT_ATTR, "1");
    node.classList.add(LOADING_CLASS);
    processingQueue.push(node);
  }
  void runQueue();
}

function isStillProcessed(node: HTMLElement): boolean {
  if (!node.hasAttribute(PROCESSED_ATTR)) {
    return false;
  }
  return (
    node.querySelector(".xenglish-wrapper") !== null ||
    node.querySelector(".xenglish-error") !== null
  );
}

async function runQueue(): Promise<void> {
  if (queueBusy) {
    return;
  }
  queueBusy = true;

  while (processingQueue.length > 0) {
    const node = processingQueue.shift();
    if (!node || !node.isConnected) {
      if (node) {
        inFlightSet.delete(node);
      }
      continue;
    }

    const text = extractText(node);
    if (!text) {
      inFlightSet.delete(node);
      node.removeAttribute(IN_FLIGHT_ATTR);
      node.classList.remove(LOADING_CLASS);
      node.setAttribute(PROCESSED_ATTR, "1");
      continue;
    }

    try {
      const response = await sendMessage<ProcessResult>({
        type: "XENGLISH_PROCESS_TWEET",
        text,
      });
      renderProcessedText(node, response.result);
      node.setAttribute(PROCESSED_ATTR, "1");
      node.removeAttribute(ERROR_ATTR);
    } catch (error: unknown) {
      node.setAttribute(ERROR_ATTR, "1");
      node.setAttribute(PROCESSED_ATTR, "1");
      renderError(node, getErrorMessage(error));
    } finally {
      inFlightSet.delete(node);
      node.classList.remove(LOADING_CLASS);
      node.removeAttribute(IN_FLIGHT_ATTR);
    }
  }

  queueBusy = false;
}

let popoverCounter = 0;

function renderProcessedText(targetNode: HTMLElement, result: ProcessResult): void {
  if (!result.englishText || result.chunks.length === 0) {
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "xenglish-wrapper";
  wrapper.dataset.xenglishContext = result.englishText;

  for (let index = 0; index < result.chunks.length; index += 1) {
    const chunk = result.chunks[index];
    popoverCounter += 1;
    const anchorName = `--xenglish-chunk-${popoverCounter}`;

    const chunkNode = document.createElement("span");
    chunkNode.className = "xenglish-chunk";
    renderInlineContent(chunkNode, chunk.text);
    chunkNode.style.setProperty("anchor-name", anchorName);

    const popover = document.createElement("div");
    popover.popover = "auto";
    popover.className = "xenglish-popover";
    popover.style.setProperty("position-anchor", anchorName);

    const gloss = document.createElement("div");
    gloss.className = "xenglish-popover-gloss";
    gloss.textContent = chunk.ja;
    popover.appendChild(gloss);

    const hint = document.createElement("div");
    hint.className = "xenglish-popover-hint";
    hint.textContent = "クリックして質問";
    popover.appendChild(hint);

    popover.addEventListener("click", () => {
      ensureQA(popover, result.englishText, chunk.text);
    });

    setupHover(chunkNode, popover);

    wrapper.appendChild(chunkNode);
    wrapper.appendChild(popover);

    if (index !== result.chunks.length - 1) {
      const nextText = result.chunks[index + 1].text;
      if (!chunk.text.endsWith("\n") && !nextText.startsWith("\n")) {
        wrapper.appendChild(document.createTextNode(" "));
      }
    }
  }

  targetNode.textContent = "";
  targetNode.appendChild(wrapper);
}

function setupHover(chunkNode: HTMLElement, popover: HTMLElement): void {
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const show = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    if (!popover.matches(":popover-open")) {
      popover.showPopover();
    }
  };

  const scheduleHide = () => {
    hideTimeout = setTimeout(() => {
      if (popover.matches(":popover-open")) {
        popover.hidePopover();
      }
    }, 100);
  };

  chunkNode.addEventListener("mouseenter", show);
  chunkNode.addEventListener("mouseleave", scheduleHide);
  popover.addEventListener("mouseenter", show);
  popover.addEventListener("mouseleave", scheduleHide);
}

function ensureQA(popover: HTMLElement, englishText: string, chunkText: string): void {
  if (popover.querySelector(".xenglish-qa")) {
    return;
  }

  const hint = popover.querySelector(".xenglish-popover-hint");
  if (hint) {
    hint.remove();
  }

  const qa = document.createElement("div");
  qa.className = "xenglish-qa";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "例: xxxの意味は？";
  input.className = "xenglish-qa-input";
  qa.appendChild(input);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "質問";
  button.className = "xenglish-qa-button";
  qa.appendChild(button);

  const answer = document.createElement("div");
  answer.className = "xenglish-qa-answer";
  qa.appendChild(answer);

  button.addEventListener("click", async () => {
    const question = input.value.trim();
    if (!question) {
      return;
    }

    button.disabled = true;
    answer.textContent = "回答を取得中...";

    try {
      const response = await sendMessage<AskResult>({
        type: "XENGLISH_ASK_QUESTION",
        payload: { englishText, chunkText, question },
      });
      answer.textContent = response.result.answer || "回答を取得できませんでした。";
    } catch (error: unknown) {
      answer.textContent = `エラー: ${getErrorMessage(error)}`;
    } finally {
      button.disabled = false;
    }
  });

  popover.appendChild(qa);
  input.focus();
}

function renderError(targetNode: HTMLElement, message: string): void {
  if (targetNode.querySelector(".xenglish-error")) {
    return;
  }
  const errorNode = document.createElement("span");
  errorNode.className = "xenglish-error";
  errorNode.textContent = `XEnglish: ${message}`;
  targetNode.appendChild(document.createElement("br"));
  targetNode.appendChild(errorNode);
}

const INLINE_TOKEN = /(#[\p{L}\p{N}_]+|https?:\/\/\S+|\n)/gu;

function renderInlineContent(parent: HTMLElement, text: string): void {
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, matchIndex)));
    }

    const token = match[0];
    if (token === "\n") {
      parent.appendChild(document.createElement("br"));
    } else if (token.startsWith("#")) {
      const span = document.createElement("span");
      span.className = "xenglish-hashtag";
      span.textContent = token;
      parent.appendChild(span);
    } else {
      const cleanUrl = token.replace(/[.,;:!?)]+$/, "");
      const trailing = token.slice(cleanUrl.length);

      const link = document.createElement("a");
      link.className = "xenglish-link";
      link.href = cleanUrl;
      link.textContent = formatLinkText(cleanUrl);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.appendChild(link);

      if (trailing) {
        parent.appendChild(document.createTextNode(trailing));
      }
    }

    lastIndex = matchIndex + token.length;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function formatLinkText(url: string): string {
  try {
    const u = new URL(url);
    const display = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
    return display.length > 30 ? `${display.slice(0, 30)}…` : display;
  } catch {
    return url;
  }
}

function extractText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  const brs = clone.querySelectorAll("br");
  for (const br of brs) {
    br.replaceWith("\n");
  }
  return (clone.textContent || "")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendMessage<T>(message: RuntimeMessage): Promise<{ ok: true; result: T }> {
  const response = await new Promise<RuntimeResponse<T>>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (rawResponse: RuntimeResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!rawResponse) {
        reject(new Error("拡張機能からの応答がありません。"));
        return;
      }
      resolve(rawResponse);
    });
  });

  if (!response.ok) {
    throw new Error(response.error.message || "拡張機能エラー");
  }
  return response;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "不明なエラー";
}
