import { DEFAULT_MODEL } from "./shared/messages";

const apiKeyInput = getInputById("apiKey");
const modelInput = getInputById("model");
const saveButton = getButtonById("saveButton");
const status = getDivById("status");

void init();

saveButton.addEventListener("click", async () => {
  const openaiApiKey = apiKeyInput.value.trim();
  const openaiModel = modelInput.value.trim() || DEFAULT_MODEL;

  await chrome.storage.local.set({
    openaiApiKey,
    openaiModel
  });

  status.textContent = "保存しました。";
  setTimeout(() => {
    status.textContent = "";
  }, 1500);
});

async function init(): Promise<void> {
  const data = (await chrome.storage.local.get([
    "openaiApiKey",
    "openaiModel"
  ])) as { openaiApiKey?: string; openaiModel?: string };

  apiKeyInput.value = data.openaiApiKey || "";
  modelInput.value = data.openaiModel || DEFAULT_MODEL;
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
