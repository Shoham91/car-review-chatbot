import "dotenv/config";
import { createOpenAI } from "@ai-sdk/openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("[llm] OPENAI_API_KEY is missing. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// gpt-5.4-mini: picked after replaying the same session on gpt-5-mini / gpt-5.4-mini / gpt-4.1-mini
// (best Hebrew, shortest answers, 4-6s per turn). See scripts/compare-models.ts.
export const DEFAULT_MODEL_ID = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

export function getModel(id: string = DEFAULT_MODEL_ID) {
  return openai(id);
}

export type Effort = "minimal" | "low" | "medium";

/**
 * Reasoning ("thinking") level per call. Only gpt-5 family models reason; for others
 * (e.g. gpt-4.1-mini) this returns no options. gpt-5.1+ renamed the lowest level
 * from "minimal" to "none", so "minimal" is mapped accordingly.
 */
export function reasoningOptions(modelId: string, effort: Effort): { openai: { reasoningEffort: string } } | undefined {
  if (!/^gpt-5/.test(modelId)) return undefined;
  const isOriginalGpt5 = /^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/.test(modelId);
  const reasoningEffort = effort === "minimal" && !isOriginalGpt5 ? "none" : effort;
  return { openai: { reasoningEffort } };
}
