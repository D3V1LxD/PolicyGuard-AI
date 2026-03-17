export function cleanWhitespace(input = "") {
  return String(input).replace(/\s+/g, " ").trim();
}

export function countWords(input = "") {
  return cleanWhitespace(input).split(" ").filter(Boolean).length;
}

export function guessLanguage(text = "") {
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

  return "unknown";
}

export function extractReadableTextFromDocument(doc) {
  const body = doc?.body;
  if (!body) {
    return "";
  }

  const clone = body.cloneNode(true);

  clone
    .querySelectorAll(
      [
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
      ].join(",")
    )
    .forEach((el) => el.remove());

  let text = cleanWhitespace(clone.textContent || "");
  if (text.length < 400) {
    text = cleanWhitespace(body.textContent || "");
  }

  return text;
}
