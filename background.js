import {
  countWords,
  splitIntoWordChunks,
  mergeChunkSummaries
} from "./utils/chunker.js";
import {
  analyzePolicyWithLLM,
  summarizeChunkWithLLM,
  finalizeCombinedAnalysis,
  buildLocalAnalysis
} from "./utils/api.js";
import { parseStrictPolicyJson } from "./utils/parser.js";

const tabDetectionState = new Map();
const tabAnalysisCache = new Map();
const signupAutoAnalysisState = new Map();
const websiteAutoSummaryState = new Map();
const websiteAutoSummaryCache = new Map();

async function initializeSettings() {
  const defaults = {
    privacyMode: false,
    autoAnalyzeWebsite: true,
    autoAnalyzeAuthPages: true,
    githubApiKey: "YOUR_GITHUB_API_KEY",
    githubApiUrl: "https://models.inference.ai.azure.com/chat/completions",
    modelName: "Meta-Llama-3.1-8B-Instruct"
  };

  const legacy = await chrome.storage.local.get(["nvidiaApiKey", "nvidiaApiUrl"]);
  const migration = {};

  if (legacy.nvidiaApiKey && !legacy.githubApiKey) {
    migration.githubApiKey = legacy.nvidiaApiKey;
  }

  if (legacy.nvidiaApiUrl && !legacy.githubApiUrl) {
    migration.githubApiUrl = legacy.nvidiaApiUrl;
  }

  if (Object.keys(migration).length) {
    await chrome.storage.local.set(migration);
  }

  const existing = await chrome.storage.local.get(Object.keys(defaults));
  const missing = {};
  for (const [key, value] of Object.entries(defaults)) {
    const currentValue = existing[key];
    const shouldUseDefault =
      typeof currentValue === "undefined" ||
      (key === "githubApiKey" &&
        (currentValue === "YOUR_GITHUB_API_KEY" || currentValue === "YOUR_NVIDIA_API_KEY"));

    if (shouldUseDefault) {
      missing[key] = value;
    }
  }
  if (Object.keys(missing).length) {
    await chrome.storage.local.set(missing);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  initializeSettings();
});

chrome.runtime.onStartup.addListener(() => {
  initializeSettings();
});

initializeSettings();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "POLICY_PAGE_DETECTED") {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      tabDetectionState.set(tabId, {
        isPolicyPage: Boolean(message.payload?.isPolicyPage),
        confidence: message.payload?.confidence || "low",
        reasons: message.payload?.reasons || []
      });
      updateBadgeForDetection(tabId, Boolean(message.payload?.isPolicyPage));
    }
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "SET_PRIVACY_MODE") {
    chrome.storage.local
      .set({ privacyMode: Boolean(message.payload?.enabled) })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SET_AUTO_ANALYZE_TOGGLES") {
    chrome.storage.local
      .set({
        autoAnalyzeWebsite: Boolean(message.payload?.autoAnalyzeWebsite),
        autoAnalyzeAuthPages: Boolean(message.payload?.autoAnalyzeAuthPages)
      })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SIGNUP_PAGE_DETECTED") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "Missing tab id." });
      return;
    }

    chrome.storage.local
      .get(["autoAnalyzeAuthPages"])
      .then((settings) => {
        if (!Boolean(settings.autoAnalyzeAuthPages)) {
          sendResponse({ ok: true, skipped: true });
          return;
        }

        const currentUrl = sender.tab?.url || message.payload?.url || "";
        const currentSignature = `${tabId}:${currentUrl}`;
        const previousSignature = signupAutoAnalysisState.get(tabId);

        if (!message.payload?.isSignupPage || previousSignature === currentSignature) {
          sendResponse({ ok: true, skipped: true });
          return;
        }

        signupAutoAnalysisState.set(tabId, currentSignature);

        handleAnalyzePage({ payload: { tabId } })
          .then((result) =>
            chrome.tabs.sendMessage(tabId, {
              type: "SHOW_ANALYSIS_POPUP",
              payload: {
                result,
                source: "signup-auto"
              }
            })
          )
          .catch((error) => {
            const messageText = String(error?.message || "").toLowerCase();
            if (
              messageText.includes("no readable policy text") ||
              messageText.includes("no readable text found")
            ) {
              return;
            }

            return chrome.tabs.sendMessage(tabId, {
              type: "SHOW_ANALYSIS_POPUP",
              payload: {
                error: error.message || "Auto-analysis failed.",
                source: "signup-auto"
              }
            });
          })
          .finally(() => sendResponse({ ok: true }));
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "AUTO_ANALYZE_WEBSITE") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, error: "Missing tab id." });
      return;
    }

    chrome.storage.local
      .get(["autoAnalyzeWebsite"])
      .then((settings) => {
        if (!Boolean(settings.autoAnalyzeWebsite)) {
          sendResponse({ ok: true, skipped: true });
          return;
        }

        handleAutoAnalyzeWebsite(message, sender, tabId)
          .then(() => sendResponse({ ok: true }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
      })
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_API_KEY") {
    const apiKey = message.payload?.apiKey || "YOUR_GITHUB_API_KEY";
    chrome.storage.local
      .set({ githubApiKey: apiKey, nvidiaApiKey: apiKey })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_TAB_STATUS") {
    handleGetTabStatus(message)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "ANALYZE_PAGE") {
    handleAnalyzePage(message)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "Failed to analyze this page."
        });
      });
    return true;
  }
});

async function handleGetTabStatus(message) {
  const tabId = message.payload?.tabId;
  if (typeof tabId !== "number") {
    throw new Error("Missing tab id.");
  }

  const storage = await chrome.storage.local.get([
    "privacyMode",
    "autoAnalyzeWebsite",
    "autoAnalyzeAuthPages"
  ]);
  return {
    privacyMode: Boolean(storage.privacyMode),
    autoAnalyzeWebsite:
      typeof storage.autoAnalyzeWebsite === "undefined"
        ? true
        : Boolean(storage.autoAnalyzeWebsite),
    autoAnalyzeAuthPages:
      typeof storage.autoAnalyzeAuthPages === "undefined"
        ? true
        : Boolean(storage.autoAnalyzeAuthPages),
    detection: tabDetectionState.get(tabId) || {
      isPolicyPage: false,
      confidence: "low",
      reasons: []
    },
    cachedResult: tabAnalysisCache.get(tabId) || null
  };
}

async function handleAnalyzePage(message) {
  const tabId = message.payload?.tabId;
  if (typeof tabId !== "number") {
    throw new Error("No active tab found.");
  }

  const extraction = await chrome.tabs.sendMessage(tabId, {
    type: "EXTRACT_POLICY_TEXT"
  });

  if (!extraction?.ok) {
    throw new Error(extraction?.error || "Could not extract page text.");
  }

  const text = extraction.payload?.text?.trim();
  if (!text) {
    throw new Error("No readable policy text found on this page.");
  }

  const meta = {
    url: extraction.payload?.url || "",
    title: extraction.payload?.title || "",
    language: extraction.payload?.language || "unknown",
    wordCount: extraction.payload?.wordCount || countWords(text)
  };

  const analysis = await runAnalysisPipeline(text, meta);
  tabAnalysisCache.set(tabId, analysis);

  updateBadgeForRisk(tabId, analysis.risk_level);

  return {
    ...analysis,
    meta
  };
}

async function runAnalysisPipeline(text, meta) {
  const settings = await chrome.storage.local.get([
    "privacyMode",
    "githubApiKey",
    "githubApiUrl",
    "nvidiaApiKey",
    "nvidiaApiUrl",
    "modelName"
  ]);

  const privacyMode = Boolean(settings.privacyMode);
  const apiOptions = {
    apiKey: settings.githubApiKey || settings.nvidiaApiKey,
    endpoint: settings.githubApiUrl || settings.nvidiaApiUrl,
    model: settings.modelName
  };

  if (privacyMode) {
    return buildLocalAnalysis(text, meta);
  }

  const words = countWords(text);
  const isLargeDocument = words > 3000;

  if (!isLargeDocument) {
    const raw = await analyzePolicyWithLLM(text, meta, apiOptions);
    return parseStrictPolicyJson(raw);
  }

  const chunks = splitIntoWordChunks(text, 3000, 140);
  const chunkSummaries = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const summary = await summarizeChunkWithLLM(
      chunk,
      index + 1,
      chunks.length,
      meta,
      apiOptions
    );
    chunkSummaries.push(summary);
  }

  const merged = mergeChunkSummaries(chunkSummaries);
  const combinedRaw = await finalizeCombinedAnalysis(merged, meta, apiOptions);
  return parseStrictPolicyJson(combinedRaw);
}

async function handleAutoAnalyzeWebsite(message, sender, tabId) {
  const payload = message.payload || {};
  const pageUrl = payload.url || sender.tab?.url || "";
  const origin = safeOrigin(pageUrl);
  if (!origin) {
    return;
  }

  const pageSignature = `${origin}::${pageUrl}`;
  if (websiteAutoSummaryState.get(tabId) === pageSignature) {
    return;
  }
  websiteAutoSummaryState.set(tabId, pageSignature);

  if (websiteAutoSummaryCache.has(origin)) {
    await chrome.tabs.sendMessage(tabId, {
      type: "SHOW_ANALYSIS_POPUP",
      payload: {
        result: websiteAutoSummaryCache.get(origin),
        source: "website-auto"
      }
    });
    return;
  }

  const linkGroups = payload.policyLinks || {};
  const privacyLinks = Array.isArray(linkGroups.privacy) ? linkGroups.privacy : [];
  const termsLinks = Array.isArray(linkGroups.terms) ? linkGroups.terms : [];

  const bestPrivacy = chooseBestLink(privacyLinks);
  const bestTerms = chooseBestLink(termsLinks);

  const collectedSections = [];

  if (bestPrivacy) {
    const fetchedPrivacy = await fetchAndExtractPageText(bestPrivacy);
    if (fetchedPrivacy.text) {
      collectedSections.push(`PRIVACY POLICY\nURL: ${bestPrivacy}\n${fetchedPrivacy.text}`);
    }
  }

  if (bestTerms) {
    const fetchedTerms = await fetchAndExtractPageText(bestTerms);
    if (fetchedTerms.text) {
      collectedSections.push(`TERMS & CONDITIONS\nURL: ${bestTerms}\n${fetchedTerms.text}`);
    }
  }

  if (!collectedSections.length) {
    // Silent skip: do not interrupt page experience when no policy text is discoverable.
    return;
  }

  const combinedPolicyText = collectedSections.join("\n\n----------------\n\n");

  const meta = {
    url: origin,
    title: `Website policy overview for ${origin}`,
    language: "unknown",
    wordCount: countWords(combinedPolicyText)
  };

  const analysis = await runAnalysisPipeline(combinedPolicyText, meta);
  websiteAutoSummaryCache.set(origin, analysis);

  await chrome.tabs.sendMessage(tabId, {
    type: "SHOW_ANALYSIS_POPUP",
    payload: {
      result: analysis,
      source: "website-auto"
    }
  });
}

function safeOrigin(url) {
  try {
    return new URL(url).origin;
  } catch (_error) {
    return "";
  }
}

function chooseBestLink(links) {
  if (!Array.isArray(links) || !links.length) {
    return "";
  }

  return links
    .map((link) => String(link || "").trim())
    .filter(Boolean)
    .find((link) => /^https?:\/\//i.test(link)) || "";
}

async function fetchAndExtractPageText(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { text: "" };
    }

    const html = await response.text();
    const text = htmlToReadableText(html);
    return { text };
  } catch (_error) {
    return { text: "" };
  }
}

function htmlToReadableText(html) {
  if (!html || typeof html !== "string") {
    return "";
  }

  let stripped = html;
  stripped = stripped.replace(/<script[\s\S]*?<\/script>/gi, " ");
  stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, " ");
  stripped = stripped.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  stripped = stripped.replace(/<!--([\s\S]*?)-->/g, " ");
  stripped = stripped.replace(/<[^>]+>/g, " ");
  stripped = stripped.replace(/&nbsp;|&#160;/gi, " ");
  stripped = stripped.replace(/&amp;/gi, "&");
  stripped = stripped.replace(/&lt;/gi, "<");
  stripped = stripped.replace(/&gt;/gi, ">");
  stripped = stripped.replace(/&quot;/gi, '"');
  stripped = stripped.replace(/&#39;/gi, "'");
  stripped = stripped.replace(/\s+/g, " ").trim();

  if (stripped.length > 60000) {
    return stripped.slice(0, 60000);
  }

  return stripped;
}

function updateBadgeForDetection(tabId, isPolicyPage) {
  if (!chrome.action?.setBadgeText) {
    return;
  }

  chrome.action.setBadgeText({
    tabId,
    text: isPolicyPage ? "PG" : ""
  });

  chrome.action.setBadgeBackgroundColor({
    tabId,
    color: isPolicyPage ? "#2563eb" : "#9ca3af"
  });
}

function updateBadgeForRisk(tabId, riskLevel) {
  const normalized = String(riskLevel || "").toLowerCase();
  let color = "#16a34a";
  let text = "LOW";

  if (normalized === "medium") {
    color = "#ca8a04";
    text = "MED";
  }

  if (normalized === "high") {
    color = "#dc2626";
    text = "HIGH";
  }

  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}
