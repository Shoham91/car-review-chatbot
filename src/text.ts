// Invisible characters that can hide text from a human reader but not from an LLM
// (zero-width chars, bidi overrides, Unicode "tag" characters), plus ASCII control chars.
// Used both on scraped article text (prompt-injection hygiene) and on LLM output.
const INVISIBLE =
  /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]|[\u{E0000}-\u{E007F}]/gu;

export function cleanText(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Recursively apply cleanText to every string in a JSON-like value. */
export function cleanDeep<T>(value: T): T {
  if (typeof value === "string") return cleanText(value) as T;
  if (Array.isArray(value)) return value.map(cleanDeep) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanDeep(v)])) as T;
  }
  return value;
}
