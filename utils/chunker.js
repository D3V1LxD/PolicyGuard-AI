export function countWords(text) {
  if (!text || typeof text !== "string") {
    return 0;
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitIntoWordChunks(text, maxWords = 3000, overlapWords = 120) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return [words.join(" ")];
  }

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(" "));

    if (end >= words.length) {
      break;
    }

    start = Math.max(end - overlapWords, start + 1);
  }

  return chunks;
}

export function mergeChunkSummaries(chunkSummaries) {
  return chunkSummaries
    .map((summary, index) => `Chunk ${index + 1}: ${summary}`)
    .join("\n\n");
}
