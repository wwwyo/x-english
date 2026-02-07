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
const CHUNK_SELECTOR = ".xenglish-chunk";

const processingQueue: HTMLElement[] = [];
let queueBusy = false;

export default defineContentScript({
  matches: ["https://x.com/*", "https://twitter.com/*"],
  runAt: "document_idle",
  main() {
    initContentScript();
  },
});

function initContentScript(): void {
  const tooltip = createTooltip();
  document.documentElement.appendChild(tooltip.root);

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
    if (node.hasAttribute(PROCESSED_ATTR) || node.hasAttribute(IN_FLIGHT_ATTR)) {
      continue;
    }
    node.setAttribute(IN_FLIGHT_ATTR, "1");
    node.classList.add(LOADING_CLASS);
    processingQueue.push(node);
  }
  void runQueue();
}

async function runQueue(): Promise<void> {
  if (queueBusy) {
    return;
  }
  queueBusy = true;

  while (processingQueue.length > 0) {
    const node = processingQueue.shift();
    if (!node || !node.isConnected) {
      continue;
    }

    const text = extractText(node);
    if (!text) {
      node.removeAttribute(IN_FLIGHT_ATTR);
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
      node.classList.remove(LOADING_CLASS);
      node.removeAttribute(IN_FLIGHT_ATTR);
    }
  }

  queueBusy = false;
}

function renderProcessedText(targetNode: HTMLElement, result: ProcessResult): void {
  if (!result.englishText || result.chunks.length === 0) {
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "xenglish-wrapper";
  wrapper.dataset.xenglishContext = result.englishText;

  for (let index = 0; index < result.chunks.length; index += 1) {
    const chunk = result.chunks[index];
    const chunkNode = document.createElement("span");
    chunkNode.className = "xenglish-chunk";
    chunkNode.textContent = chunk.text;
    chunkNode.dataset.ja = chunk.ja;
    chunkNode.dataset.context = result.englishText;
    chunkNode.dataset.chunk = chunk.text;
    wrapper.appendChild(chunkNode);

    if (index !== result.chunks.length - 1) {
      wrapper.appendChild(document.createTextNode(" "));
    }
  }

  targetNode.innerHTML = "";
  targetNode.appendChild(wrapper);
}

function renderError(targetNode: HTMLElement, message: string): void {
  if (targetNode.querySelector(".xenglish-error")) {
    return;
  }
  const errorNode = document.createElement("span");
  errorNode.className = "xenglish-error";
  errorNode.textContent = `xEnglish: ${message}`;
  targetNode.appendChild(document.createElement("br"));
  targetNode.appendChild(errorNode);
}

function createTooltip(): { root: HTMLDivElement } {
  const root = document.createElement("div");
  root.className = "xenglish-tooltip-root";

  const gloss = document.createElement("div");
  gloss.className = "xenglish-tooltip-gloss";
  root.appendChild(gloss);

  const hint = document.createElement("div");
  hint.className = "xenglish-tooltip-hint";
  hint.textContent = "クリックして文脈質問";
  root.appendChild(hint);

  const qa = document.createElement("div");
  qa.className = "xenglish-qa";
  qa.hidden = true;

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

  root.appendChild(qa);

  const state: { chunkEl: HTMLElement | null } = {
    chunkEl: null,
  };

  button.addEventListener("click", async () => {
    if (!state.chunkEl) {
      return;
    }
    const question = input.value.trim();
    if (!question) {
      return;
    }

    button.disabled = true;
    answer.textContent = "回答を取得中...";

    try {
      const response = await sendMessage<AskResult>({
        type: "XENGLISH_ASK_QUESTION",
        payload: {
          englishText: state.chunkEl.dataset.context || "",
          chunkText: state.chunkEl.dataset.chunk || "",
          question,
        },
      });
      answer.textContent = response.result.answer || "回答を取得できませんでした。";
    } catch (error: unknown) {
      answer.textContent = `エラー: ${getErrorMessage(error)}`;
    } finally {
      button.disabled = false;
    }
  });

  root.addEventListener("mouseleave", (event) => {
    if (!event.relatedTarget || !root.contains(event.relatedTarget as Node)) {
      hideTooltip(root, qa, input, answer, state);
    }
  });

  root.addEventListener("click", () => {
    qa.hidden = false;
    input.focus();
  });

  document.addEventListener("mouseover", (event) => {
    const chunkEl = findChunkElement(event.target);
    if (!chunkEl) {
      return;
    }

    state.chunkEl = chunkEl;
    gloss.textContent = chunkEl.dataset.ja || "";
    qa.hidden = true;
    input.value = "";
    answer.textContent = "";
    positionTooltip(root, chunkEl);
  });

  document.addEventListener("mouseout", (event) => {
    const fromChunk = findChunkElement(event.target);
    if (!fromChunk) {
      return;
    }
    const toNode = event.relatedTarget as Node | null;
    if (toNode && (findChunkElement(toNode) || root.contains(toNode))) {
      return;
    }
    hideTooltip(root, qa, input, answer, state);
  });

  return { root };
}

function hideTooltip(
  root: HTMLDivElement,
  qa: HTMLDivElement,
  input: HTMLInputElement,
  answer: HTMLDivElement,
  state: { chunkEl: HTMLElement | null },
): void {
  root.style.display = "none";
  qa.hidden = true;
  input.value = "";
  answer.textContent = "";
  state.chunkEl = null;
}

function positionTooltip(root: HTMLDivElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  root.style.display = "block";
  root.style.left = `${window.scrollX + rect.left}px`;
  root.style.top = `${window.scrollY + rect.bottom + 8}px`;
}

function findChunkElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const chunk = target.closest(CHUNK_SELECTOR);
  return chunk instanceof HTMLElement ? chunk : null;
}

function extractText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  const brs = clone.querySelectorAll("br");
  for (const br of brs) {
    br.replaceWith("\n");
  }
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
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
