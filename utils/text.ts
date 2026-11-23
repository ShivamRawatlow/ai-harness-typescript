import { encodingForModel, getEncoding, TiktokenModel } from "js-tiktoken";

function getTokenizer(model: string): (text: string) => number {
  try {
    const enc = encodingForModel(model as TiktokenModel);
    return (text) => enc.encode(text).length;
  } catch {
    try {
      const enc = getEncoding("cl100k_base");
      return (text) => enc.encode(text).length;
    } catch {
      return estimateTokens;
    }
  }
}

export function countTokens(text: string, model = "gpt-4"): number {
  const tokenizer = getTokenizer(model);
  return tokenizer(text);
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.floor(text.length / 4));
}

export function truncateText(
  text: string,
  model: string,
  maxTokens: number,
  suffix = "\n... [truncated]",
  preserveLines = true,
): string {
  if (countTokens(text, model) <= maxTokens) {
    return text;
  }

  const suffixTokens = countTokens(suffix, model);
  const targetTokens = maxTokens - suffixTokens;

  if (targetTokens <= 0) {
    return suffix.trim();
  }

  if (preserveLines) {
    return truncateByLines(text, targetTokens, suffix, model);
  } else {
    return truncateByChars(text, targetTokens, suffix, model);
  }
}

function truncateByLines(
  text: string,
  targetTokens: number,
  suffix: string,
  model: string,
): string {
  const lines = text.split("\n");
  const resultLines: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line + "\n", model);
    if (currentTokens + lineTokens > targetTokens) {
      break;
    }
    resultLines.push(line);
    currentTokens += lineTokens;
  }

  if (resultLines.length === 0) {
    return truncateByChars(text, targetTokens, suffix, model);
  }

  return resultLines.join("\n") + suffix;
}

function truncateByChars(
  text: string,
  targetTokens: number,
  suffix: string,
  model: string,
): string {
  let low = 0;
  let high = text.length;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (countTokens(text.slice(0, mid), model) <= targetTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return text.slice(0, low) + suffix;
}
