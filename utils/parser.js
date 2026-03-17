const DEFAULT_RESULT = {
  summary: "Unable to generate summary.",
  safety_score: 5,
  risk_level: "Medium",
  key_points: [],
  red_flags: [],
  categories: {
    data_collection: "Medium",
    third_party_sharing: "Medium",
    tracking: "Medium",
    user_rights: "Moderate"
  }
};

const RISK_LEVELS = new Set(["Low", "Medium", "High"]);
const CATEGORY_LEVELS = new Set(["Low", "Medium", "High"]);
const RIGHTS_LEVELS = new Set(["Strong", "Moderate", "Weak"]);

function extractLikelyJson(input) {
  if (!input || typeof input !== "string") {
    return "";
  }

  const cleaned = input.trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return cleaned;
  }

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return cleaned.slice(start, end + 1);
  }

  return "";
}

function clampSafetyScore(value) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return 5;
  }
  return Math.min(10, Math.max(1, Math.round(parsed)));
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeRisk(value) {
  const candidate = String(value || "").trim();
  if (RISK_LEVELS.has(candidate)) {
    return candidate;
  }

  const lower = candidate.toLowerCase();
  if (lower === "low") return "Low";
  if (lower === "high") return "High";
  return "Medium";
}

function normalizeCategory(value) {
  const candidate = String(value || "").trim();
  if (CATEGORY_LEVELS.has(candidate)) {
    return candidate;
  }

  const lower = candidate.toLowerCase();
  if (lower === "low") return "Low";
  if (lower === "high") return "High";
  return "Medium";
}

function normalizeRights(value) {
  const candidate = String(value || "").trim();
  if (RIGHTS_LEVELS.has(candidate)) {
    return candidate;
  }

  const lower = candidate.toLowerCase();
  if (lower === "strong") return "Strong";
  if (lower === "weak") return "Weak";
  return "Moderate";
}

export function parseStrictPolicyJson(rawModelOutput) {
  try {
    const jsonText = extractLikelyJson(rawModelOutput);
    if (!jsonText) {
      return { ...DEFAULT_RESULT };
    }

    const parsed = JSON.parse(jsonText);

    return {
      summary: String(parsed.summary || DEFAULT_RESULT.summary).trim(),
      safety_score: clampSafetyScore(parsed.safety_score),
      risk_level: normalizeRisk(parsed.risk_level),
      key_points: normalizeList(parsed.key_points),
      red_flags: normalizeList(parsed.red_flags),
      categories: {
        data_collection: normalizeCategory(parsed.categories?.data_collection),
        third_party_sharing: normalizeCategory(parsed.categories?.third_party_sharing),
        tracking: normalizeCategory(parsed.categories?.tracking),
        user_rights: normalizeRights(parsed.categories?.user_rights)
      }
    };
  } catch (_error) {
    return { ...DEFAULT_RESULT };
  }
}
