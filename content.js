const POLICY_URL_PATTERNS = [
  /privacy/i,
  /policy/i,
  /terms/i,
  /tos/i,
  /conditions/i,
  /legal/i
];

const POLICY_KEYWORDS = [
  "privacy policy",
  "terms of service",
  "terms & conditions",
  "terms and conditions",
  "data collection",
  "data sharing",
  "cookies",
  "personal data",
  "third-party",
  "terms-of-service",
  "privacy-notice",
  "cookie-policy",
  "data-retention",
  "user rights"
];

const SIGNUP_URL_PATTERNS = [
  /signup/i,
  /sign-up/i,
  /signin/i,
  /sign-in/i,
  /login/i,
  /log-in/i,
  /auth/i,
  /register/i,
  /create-account/i,
  /join/i
];

function detectSignupPage() {
  const reasons = [];
  const url = window.location.href || "";

  if (SIGNUP_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    reasons.push("URL looks like signup/register page");
  }

  const passwordInputs = document.querySelectorAll('input[type="password"]').length;
  const emailInputs = document.querySelectorAll('input[type="email"]').length;
  const signupButtons = Array.from(document.querySelectorAll("button, input[type='submit']")).filter(
    (el) =>
      /sign up|signup|register|create account|join|sign in|signin|log in|login/i.test(
        el.textContent || el.value || ""
      )
  ).length;

  if (passwordInputs > 0 && (emailInputs > 0 || signupButtons > 0)) {
    reasons.push("Sign-in/Sign-up form fields detected");
  }

  return {
    isSignupPage: reasons.length > 0,
    reasons
  };
}

function collectPolicyLinks() {
  const anchors = Array.from(document.querySelectorAll("a[href]"));
  const privacySet = new Set();
  const termsSet = new Set();

  for (const anchor of anchors) {
    const href = (anchor.getAttribute("href") || "").trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }

    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(href, window.location.href).href;
    } catch (_error) {
      continue;
    }

    if (!/^https?:\/\//i.test(absoluteUrl)) {
      continue;
    }

    const text = (anchor.textContent || "").toLowerCase();
    const combined = `${absoluteUrl} ${text}`;

    if (/privacy|data policy|privacy notice|cookie policy/.test(combined)) {
      privacySet.add(absoluteUrl);
    }

    if (/terms|conditions|tos|terms of service|terms and conditions/.test(combined)) {
      termsSet.add(absoluteUrl);
    }
  }

  return {
    privacy: Array.from(privacySet).slice(0, 6),
    terms: Array.from(termsSet).slice(0, 6)
  };
}

function detectPolicyPage() {
  const reasons = [];
  const url = window.location.href || "";

  if (POLICY_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    reasons.push("URL matches privacy/terms pattern");
  }

  const title = (document.title || "").toLowerCase();
  if (
    title.includes("privacy") ||
    title.includes("terms") ||
    title.includes("conditions")
  ) {
    reasons.push("Page title contains privacy/terms keywords");
  }

  const sampledText =
    (document.body?.innerText || "")
      .slice(0, 30000)
      .toLowerCase()
      .replace(/\s+/g, " ") || "";

  let keywordHits = 0;
  for (const keyword of POLICY_KEYWORDS) {
    if (sampledText.includes(keyword)) {
      keywordHits += 1;
    }
  }

  if (keywordHits >= 3) {
    reasons.push(`Policy keywords detected in body (${keywordHits} hits)`);
  }

  const isPolicyPage = reasons.length > 0;
  let confidence = "low";

  if (keywordHits >= 5 || reasons.length >= 2) {
    confidence = "high";
  } else if (keywordHits >= 3 || reasons.length >= 1) {
    confidence = "medium";
  }

  return {
    isPolicyPage,
    confidence,
    reasons
  };
}

function cleanWhitespace(input) {
  return input.replace(/\s+/g, " ").trim();
}

function guessLanguage(text) {
  const sample = text.slice(0, 3000);
  const latinLetters = (sample.match(/[A-Za-z]/g) || []).length;
  const nonLatinLetters = (sample.match(/[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF]/g) || [])
    .length;

  if (latinLetters > 80 && nonLatinLetters < 15) {
    return "en";
  }

  if (nonLatinLetters > latinLetters / 2) {
    return "non-en";
  }

  return document.documentElement.lang || "unknown";
}

function extractCleanTextFromDOM() {
  const body = document.body;
  if (!body) {
    return "";
  }

  const clone = body.cloneNode(true);

  const removeSelectors = [
    "script",
    "style",
    "noscript",
    "svg",
    "canvas",
    "iframe",
    "video",
    "audio",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "nav",
    "header",
    "footer",
    "aside",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    "[role='complementary']",
    ".cookie-banner",
    ".cookie-consent",
    ".ad",
    ".ads",
    ".advertisement",
    ".sidebar",
    ".social",
    ".newsletter",
    ".comments"
  ];

  clone.querySelectorAll(removeSelectors.join(",")).forEach((el) => el.remove());

  clone.querySelectorAll("*").forEach((el) => {
    const className = (el.className || "").toString().toLowerCase();
    const id = (el.id || "").toString().toLowerCase();
    if (
      /cookie|consent|banner|nav|footer|header|menu|promo|subscribe|social|comment|ads?/.test(
        className
      ) ||
      /cookie|consent|banner|nav|footer|header|menu|promo|subscribe|social|comment|ads?/.test(
        id
      )
    ) {
      el.remove();
    }
  });

  const candidates = clone.querySelectorAll(
    "article, main, section, [role='main'], .policy, .privacy, .terms"
  );

  let rawText = "";
  if (candidates.length) {
    candidates.forEach((node) => {
      const text = cleanWhitespace(node.textContent || "");
      if (text.length > 200) {
        rawText += `\n\n${text}`;
      }
    });
  }

  if (rawText.trim().length < 600) {
    rawText = cleanWhitespace(clone.textContent || "");
  }

  return rawText.trim();
}

function countWords(text) {
  if (!text) {
    return 0;
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runAutoDetection() {
  const detection = detectPolicyPage();
  chrome.runtime.sendMessage({
    type: "POLICY_PAGE_DETECTED",
    payload: detection
  });

  const signupDetection = detectSignupPage();
  if (signupDetection.isSignupPage) {
    chrome.runtime.sendMessage({
      type: "SIGNUP_PAGE_DETECTED",
      payload: {
        ...signupDetection,
        url: window.location.href
      }
    });
  }

  chrome.runtime.sendMessage({
    type: "AUTO_ANALYZE_WEBSITE",
    payload: {
      url: window.location.href,
      policyLinks: collectPolicyLinks()
    }
  });
}

let lastDetectedUrl = "";
function detectOnUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastDetectedUrl) {
    lastDetectedUrl = currentUrl;
    runAutoDetection();
  }
}

function getOrCreateOverlay() {
  let overlay = document.getElementById("policyguard-overlay");
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement("div");
  overlay.id = "policyguard-overlay";
  overlay.style.position = "fixed";
  overlay.style.top = "20px";
  overlay.style.right = "20px";
  overlay.style.width = "360px";
  overlay.style.maxHeight = "70vh";
  overlay.style.overflow = "auto";
  overlay.style.zIndex = "2147483647";
  overlay.style.background = "#ffffff";
  overlay.style.border = "1px solid #e5e7eb";
  overlay.style.borderRadius = "12px";
  overlay.style.boxShadow = "0 12px 24px rgba(0,0,0,0.16)";
  overlay.style.fontFamily = "Segoe UI, Arial, sans-serif";
  overlay.style.color = "#111827";
  overlay.style.padding = "12px";

  document.body.appendChild(overlay);
  return overlay;
}

function riskColor(riskLevel) {
  const normalized = String(riskLevel || "").toLowerCase();
  if (normalized === "high") return "#dc2626";
  if (normalized === "medium") return "#ca8a04";
  return "#16a34a";
}

function renderAutoPopup(payload) {
  const overlay = getOrCreateOverlay();
  const closeButton =
    '<button id="policyguard-close" style="border:none;background:transparent;cursor:pointer;font-size:16px;line-height:1;">✕</button>';

  const source = payload?.source || "signup-auto";
  const sourceLabel =
    source === "website-auto"
      ? "Website policy auto-summary"
      : "Auto-analysis on sign-in/sign-up page";

  if (payload?.error) {
    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>PolicyGuard AI</strong>${closeButton}
      </div>
      <div style="font-size:13px;color:#991b1b;background:#fee2e2;border-radius:8px;padding:8px;">${payload.error}</div>
      <div style="margin-top:8px;font-size:11px;color:#6b7280;">This is an AI-generated summary and not legal advice.</div>
    `;
  } else {
    const result = payload.result || {};
    const keyPoints = (result.key_points || []).map((item) => `<li>${item}</li>`).join("") || "<li>None detected.</li>";
    const redFlags = (result.red_flags || []).map((item) => `<li>${item}</li>`).join("") || "<li>None detected.</li>";

    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <strong>PolicyGuard AI</strong>${closeButton}
      </div>
      <div style="margin-bottom:8px;font-size:12px;color:#374151;">${sourceLabel}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;">
        <span style="background:${riskColor(result.risk_level)};color:#fff;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;">${result.risk_level || "Unknown"}</span>
        <span style="font-size:13px;">Safety Score: <strong>${result.safety_score ?? "--"}</strong></span>
      </div>
      <div style="font-size:13px;line-height:1.4;margin-bottom:10px;">${result.summary || "No summary available."}</div>
      <div style="font-size:12px;font-weight:700;margin-bottom:4px;">Key Points</div>
      <ul style="margin:0 0 10px 16px;padding:0;font-size:12px;line-height:1.4;">${keyPoints}</ul>
      <div style="font-size:12px;font-weight:700;margin-bottom:4px;">Red Flags</div>
      <ul style="margin:0 0 8px 16px;padding:0;font-size:12px;line-height:1.4;">${redFlags}</ul>
      <div style="font-size:11px;color:#6b7280;">This is an AI-generated summary and not legal advice.</div>
    `;
  }

  const close = overlay.querySelector("#policyguard-close");
  if (close) {
    close.addEventListener("click", () => overlay.remove());
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EXTRACT_POLICY_TEXT") {
    try {
      const text = extractCleanTextFromDOM();
      if (!text) {
        sendResponse({ ok: false, error: "No readable text found." });
        return;
      }

      sendResponse({
        ok: true,
        payload: {
          text,
          wordCount: countWords(text),
          language: guessLanguage(text),
          title: document.title || "",
          url: window.location.href
        }
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Extraction failed." });
    }
  }

  if (message?.type === "SHOW_ANALYSIS_POPUP") {
    try {
      renderAutoPopup(message.payload || {});
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || "Could not render popup." });
    }
  }
});

window.addEventListener("load", () => {
  setTimeout(runAutoDetection, 200);
});
window.addEventListener("popstate", detectOnUrlChange);
setInterval(detectOnUrlChange, 1200);
