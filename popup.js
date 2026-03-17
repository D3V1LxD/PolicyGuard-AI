const pageStatus = document.getElementById("pageStatus");
const privacyModeToggle = document.getElementById("privacyModeToggle");
const apiKeyInput = document.getElementById("apiKeyInput");
const analyzeBtn = document.getElementById("analyzeBtn");

const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const resultState = document.getElementById("resultState");

const scoreBadge = document.getElementById("scoreBadge");
const riskLevel = document.getElementById("riskLevel");
const scoreScaleText = document.getElementById("scoreScaleText");
const summaryText = document.getElementById("summaryText");
const keyPointsList = document.getElementById("keyPointsList");
const redFlagsList = document.getElementById("redFlagsList");

const catDataCollection = document.getElementById("catDataCollection");
const catThirdParty = document.getElementById("catThirdParty");
const catTracking = document.getElementById("catTracking");
const catRights = document.getElementById("catRights");

let currentTabId = null;

function setLoading(isLoading) {
  loadingState.classList.toggle("hidden", !isLoading);
  analyzeBtn.disabled = isLoading;
}

function setError(message = "") {
  if (!message) {
    errorState.textContent = "";
    errorState.classList.add("hidden");
    return;
  }

  errorState.textContent = message;
  errorState.classList.remove("hidden");
}

function renderList(el, items) {
  el.innerHTML = "";
  if (!items || !items.length) {
    const li = document.createElement("li");
    li.textContent = "None detected.";
    el.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  });
}

function riskClassName(risk) {
  const normalized = String(risk || "").toLowerCase();
  if (normalized === "high") return "risk-high";
  if (normalized === "medium") return "risk-medium";
  return "risk-low";
}

function scoreColor(score) {
  if (score <= 4) return "#dc2626";
  if (score <= 7) return "#ca8a04";
  return "#16a34a";
}

function scoreBand(score) {
  if (score <= 4) return "High Risk Band";
  if (score <= 7) return "Medium Risk Band";
  return "Low Risk Band";
}

function renderResult(result) {
  resultState.classList.remove("hidden");

  const score = Number(result.safety_score || 0);
  scoreBadge.textContent = String(result.safety_score ?? "--");
  scoreBadge.style.background = scoreColor(score);
  scoreScaleText.textContent = `Score Limit: 1-10 (${scoreBand(score)})`;

  riskLevel.className = `risk-pill ${riskClassName(result.risk_level)}`;
  riskLevel.textContent = result.risk_level || "Unknown";

  summaryText.textContent = result.summary || "No summary available.";

  renderList(keyPointsList, result.key_points || []);
  renderList(redFlagsList, result.red_flags || []);

  catDataCollection.textContent = result.categories?.data_collection || "-";
  catThirdParty.textContent = result.categories?.third_party_sharing || "-";
  catTracking.textContent = result.categories?.tracking || "-";
  catRights.textContent = result.categories?.user_rights || "-";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function loadStatus() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    pageStatus.textContent = "No active tab found.";
    analyzeBtn.disabled = true;
    return;
  }

  currentTabId = tab.id;

  const settings = await chrome.storage.local.get(["githubApiKey", "nvidiaApiKey"]);
  const savedKey = settings.githubApiKey || settings.nvidiaApiKey;
  if (savedKey && savedKey !== "YOUR_GITHUB_API_KEY" && savedKey !== "YOUR_NVIDIA_API_KEY") {
    apiKeyInput.value = savedKey;
  }

  const response = await chrome.runtime.sendMessage({
    type: "GET_TAB_STATUS",
    payload: { tabId: currentTabId }
  });

  if (!response?.ok) {
    pageStatus.textContent = "Unable to read tab status.";
    return;
  }

  const status = response.status;
  privacyModeToggle.checked = Boolean(status.privacyMode);

  if (status.detection?.isPolicyPage) {
    pageStatus.textContent = "Policy-like page detected.";
  } else {
    pageStatus.textContent = "Policy page not auto-detected. You can still analyze manually.";
  }

  if (status.cachedResult) {
    renderResult(status.cachedResult);
  }
}

privacyModeToggle.addEventListener("change", async () => {
  setError("");
  const enabled = privacyModeToggle.checked;
  const response = await chrome.runtime.sendMessage({
    type: "SET_PRIVACY_MODE",
    payload: { enabled }
  });

  if (!response?.ok) {
    setError(response?.error || "Failed to change privacy mode.");
  }
});

apiKeyInput.addEventListener("blur", async () => {
  const apiKey = apiKeyInput.value.trim() || "YOUR_GITHUB_API_KEY";
  const response = await chrome.runtime.sendMessage({
    type: "SAVE_API_KEY",
    payload: { apiKey }
  });

  if (!response?.ok) {
    setError(response?.error || "Failed to save API key.");
  }
});

analyzeBtn.addEventListener("click", async () => {
  setError("");
  resultState.classList.add("hidden");

  if (!currentTabId) {
    setError("No active tab available.");
    return;
  }

  setLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "ANALYZE_PAGE",
      payload: { tabId: currentTabId }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Analysis failed.");
    }

    renderResult(response.result);
  } catch (error) {
    setError(error.message || "Analysis failed.");
  } finally {
    setLoading(false);
  }
});

loadStatus().catch((error) => {
  setError(error.message || "Failed to initialize popup.");
});
