import { DEFAULT_MODEL, SYSTEM_DAILY_LIMIT } from "@xenglish/worker/contracts";
import { DEFAULT_WORKER_BASE_URL } from "./env";

const apiKeyInput = getInputById("apiKey");
const modelInput = getInputById("model");
const workerBaseUrlInput = getInputById("workerBaseUrl");
const saveButton = getButtonById("saveButton");
const status = getDivById("status");

void init();

saveButton.addEventListener("click", async () => {
  const openaiApiKey = apiKeyInput.value.trim();
  const openaiModel = modelInput.value.trim() || DEFAULT_MODEL;
  const xenglishWorkerBaseUrl = normalizeBaseUrl(
    workerBaseUrlInput.value.trim() || DEFAULT_WORKER_BASE_URL,
  );

  // NOTE: BYOKをクライアント保存する実装は利便性優先であり、セキュリティ上は非推奨。
  await chrome.storage.local.set({
    openaiApiKey,
    openaiModel,
    xenglishWorkerBaseUrl,
  });

  status.textContent = `保存しました。システム利用上限は1日${SYSTEM_DAILY_LIMIT}件です。`;
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
});

async function init(): Promise<void> {
  const data = (await chrome.storage.local.get([
    "openaiApiKey",
    "openaiModel",
    "xenglishWorkerBaseUrl",
  ])) as {
    openaiApiKey?: string;
    openaiModel?: string;
    xenglishWorkerBaseUrl?: string;
  };

  apiKeyInput.value = data.openaiApiKey || "";
  modelInput.value = data.openaiModel || DEFAULT_MODEL;
  workerBaseUrlInput.value = data.xenglishWorkerBaseUrl || DEFAULT_WORKER_BASE_URL;
}

function getInputById(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`${id} の初期化に失敗しました。`);
  }
  return element;
}

function getButtonById(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`${id} の初期化に失敗しました。`);
  }
  return element;
}

function getDivById(id: string): HTMLDivElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLDivElement)) {
    throw new Error(`${id} の初期化に失敗しました。`);
  }
  return element;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/g, "");
}
