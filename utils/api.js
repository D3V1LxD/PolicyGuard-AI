const CORE_SYSTEM_PROMPT =
  "You are a legal analysis assistant. Analyze terms and privacy policies. Be precise, structured, and conservative in risk detection.";

const JSON_SCHEMA_PROMPT = `Return STRICT JSON only (no markdown, no explanation) with this exact shape:
{
  "summary": "short plain-English summary",
  "safety_score": 1-10,
  "risk_level": "Low | Medium | High",
  "key_points": ["..."],
  "red_flags": ["..."],
  "categories": {
    "data_collection": "Low | Medium | High",
    "third_party_sharing": "Low | Medium | High",
    "tracking": "Low | Medium | High",
    "user_rights": "Strong | Moderate | Weak"
  }
}`;

async function callOpenAICompatibleChat(messages, options = {}) {
  const apiKey = options.apiKey || "YOUR_GITHUB_API_KEY";
  const endpoint = options.endpoint || "https://models.inference.ai.azure.com/chat/completions";
  const model = options.model || "Meta-Llama-3.1-8B-Instruct";

  if (!apiKey || apiKey === "YOUR_GITHUB_API_KEY" || apiKey === "YOUR_NVIDIA_API_KEY") {
    throw new Error(
      "GitHub API key is not configured. Add your key in popup settings or storage."
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1400,
      messages
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`API request failed (${response.status}): ${details || response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("API returned no content.");
  }

  return content;
}

export async function summarizeChunkWithLLM(chunkText, chunkIndex, totalChunks, meta, options) {
  const messages = [
    {
      role: "system",
      content: `${CORE_SYSTEM_PROMPT} Summarize the provided chunk in plain English and keep major obligations, rights, data use, and risky terms.`
    },
    {
      role: "user",
      content: `Chunk ${chunkIndex}/${totalChunks} from policy page.\nTitle: ${meta.title || "Unknown"}\nURL: ${meta.url || "Unknown"}\nLanguage hint: ${meta.language || "unknown"}\n\nReturn 8-12 bullet-style sentences as plain text summary only:\n\n${chunkText}`
    }
  ];

  return callOpenAICompatibleChat(messages, options);
}

export async function finalizeCombinedAnalysis(mergedChunkSummary, meta, options) {
  const messages = [
    {
      role: "system",
      content: `${CORE_SYSTEM_PROMPT}\n${JSON_SCHEMA_PROMPT}`
    },
    {
      role: "user",
      content: `This policy was too long and was chunk-summarized first. Build a final risk analysis from the combined summary below.\nTitle: ${meta.title || "Unknown"}\nURL: ${meta.url || "Unknown"}\nLanguage hint: ${meta.language || "unknown"}\n\nCombined summary:\n${mergedChunkSummary}`
    }
  ];

  return callOpenAICompatibleChat(messages, options);
}

export async function analyzePolicyWithLLM(policyText, meta, options) {
  const messages = [
    {
      role: "system",
      content: `${CORE_SYSTEM_PROMPT}\n${JSON_SCHEMA_PROMPT}`
    },
    {
      role: "user",
      content: `Analyze this policy text. Keep output conservative, specific, and accurate.\nTitle: ${meta.title || "Unknown"}\nURL: ${meta.url || "Unknown"}\nLanguage hint: ${meta.language || "unknown"}\n\nPolicy text:\n${policyText}`
    }
  ];

  return callOpenAICompatibleChat(messages, options);
}

export function buildLocalAnalysis(text, meta = {}) {
  const lowerText = String(text || "").toLowerCase();

  const includes = (needle) => lowerText.includes(needle);

  const flags = [];
  const keyPoints = [];

  if (includes("third-party") || includes("third party") || includes("partners")) {
    keyPoints.push("Mentions sharing data with third parties or partners.");
  }
  if (includes("cookies") || includes("tracking")) {
    keyPoints.push("Uses cookies or other tracking technologies.");
  }
  if (includes("retain") || includes("retention")) {
    keyPoints.push("Describes data retention rules.");
  }

  if (includes("sell") && includes("data")) {
    flags.push("Policy may allow selling personal data.");
  }
  if (!includes("delete") && !includes("deletion") && !includes("erase")) {
    flags.push("No clear data deletion process detected.");
  }
  if (!includes("opt out") && !includes("opt-out")) {
    flags.push("No obvious opt-out process detected.");
  }

  if ((meta.language || "").toLowerCase() !== "en") {
    flags.push("Policy may be non-English; local mode analysis can be less reliable.");
  }

  const dataCollection = includes("personal data") || includes("collect") ? "High" : "Medium";
  const thirdParty =
    includes("third party") || includes("third-party") || includes("partners")
      ? "High"
      : "Low";
  const tracking = includes("cookies") || includes("tracking") ? "High" : "Low";
  const userRights =
    includes("access") || includes("delete") || includes("correct") ? "Moderate" : "Weak";

  let safetyScore = 7;
  if (flags.length >= 3) safetyScore = 3;
  else if (flags.length === 2) safetyScore = 5;
  else if (flags.length === 1) safetyScore = 6;

  let riskLevel = "Low";
  if (safetyScore <= 4) riskLevel = "High";
  else if (safetyScore <= 6) riskLevel = "Medium";

  return {
    summary:
      "Local mode is enabled. This summary is generated without external API calls and may be less accurate than LLM analysis.",
    safety_score: safetyScore,
    risk_level: riskLevel,
    key_points: keyPoints.length
      ? keyPoints
      : ["Policy text was analyzed locally using keyword heuristics."],
    red_flags: flags,
    categories: {
      data_collection: dataCollection,
      third_party_sharing: thirdParty,
      tracking,
      user_rights: userRights
    }
  };
}
