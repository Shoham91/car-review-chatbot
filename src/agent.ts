// One agent, one tool. The model reads the catalog and decides per turn whether it needs
// full articles. Tool choice IS the routing: no separate intent classifier.
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { getModel, reasoningOptions, type Effort } from "./llm.js";
import { ARTICLE_IDS, type ArticleId } from "./articles.config.js";
import { articleForPrompt, catalogForPrompt, detectMentionedCars, getProfile } from "./catalog.js";
import { buildSystemPrompt, detectLanguage } from "./prompts.js";
import type { ChatMessage } from "./store.js";
import type { Preferences } from "./preferences.js";
import { log } from "./logger.js";

const MAX_STEPS = 4; // safety cap on the tool loop
const MAX_ARTICLES_PER_TURN = 4; // forces a shortlist instead of reading all 8 (slow, long answers)
const MAX_HISTORY_MESSAGES = 20; // last 10 exchanges; older turns are dropped (no summarization yet)

export interface AgentOptions {
  modelId: string;
  effort: Effort;
  onStatus?: (text: string) => void;
}

export interface AgentResult {
  reply: string;
  fetchedIds: ArticleId[];
  citedIds: ArticleId[];
  steps: number;
  usage: { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; reasoningTokens?: number };
}

export async function runAgent(
  history: ChatMessage[],
  userMessage: string,
  preferences: Preferences,
  { modelId, effort, onStatus }: AgentOptions
): Promise<AgentResult> {
  const fetchedIds = new Set<ArticleId>();

  const getArticles = tool({
    description:
      "Fetch the full cleaned text of reviewed articles by catalog id. Shortlist with the catalog first, " +
      `then request only the cars you need (max ${MAX_ARTICLES_PER_TURN} per turn) in a single call.`,
    inputSchema: z.object({
      ids: z.array(z.enum(ARTICLE_IDS as [ArticleId, ...ArticleId[]])).min(1).max(MAX_ARTICLES_PER_TURN),
    }),
    execute: async ({ ids }) => {
      const allowed = ids.filter((id) => fetchedIds.has(id) || fetchedIds.size < MAX_ARTICLES_PER_TURN);
      const refused = ids.filter((id) => !allowed.includes(id));
      log("tool", `getArticles(${ids.join(", ")})${refused.length ? ` refused=[${refused}]` : ""}`);
      allowed.forEach((id) => fetchedIds.add(id));
      onStatus?.(`קורא את הכתבות על ${allowed.map((id) => getProfile(id).nameHe).join(", ")}…`);
      const note = refused.length
        ? `\n\n[Article limit for this turn reached: ${refused.join(", ")} not fetched. Answer with what you have.]`
        : "";
      return allowed.map(articleForPrompt).join("\n\n") + note;
    },
  });

  // History is stored as plain text (no tool results), so old articles don't pile up in context.
  // A follow-up that needs details simply fetches the article again.
  const messages: ModelMessage[] = [
    ...history.slice(-MAX_HISTORY_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  // If the user names a catalog car, the first step must read articles. Prompt rules alone weren't
  // enough: the model often answered detail questions from the short catalog summary.
  const mentioned = detectMentionedCars(userMessage);
  if (mentioned.length) log("agent", `mentioned=[${mentioned}] -> forcing getArticles on step 1`);

  const result = await generateText({
    model: getModel(modelId),
    providerOptions: reasoningOptions(modelId, effort),
    instructions: buildSystemPrompt(catalogForPrompt(), preferences, detectLanguage(userMessage)),
    messages,
    tools: { getArticles },
    stopWhen: stepCountIs(MAX_STEPS),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 && mentioned.length
        ? { toolChoice: { type: "tool", toolName: "getArticles" } }
        : {},
    onStepEnd: (step) => {
      if (step.toolCalls.length) onStatus?.("מנסח תשובה לפי הכתבות…");
    },
  });

  const reply =
    result.text.trim() || "מצטער, לא הצלחתי לנסח תשובה. אפשר לנסות לשאול שוב במילים אחרות?";

  // Citations the model wrote as [id]; keep only real ids.
  const citedIds = [...new Set([...reply.matchAll(/\[([a-z0-9-]+)\]/g)].map((m) => m[1]))].filter(
    (id): id is ArticleId => (ARTICLE_IDS as string[]).includes(id)
  );

  return {
    reply,
    fetchedIds: [...fetchedIds],
    citedIds,
    steps: result.steps.length,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens,
      reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens,
    },
  };
}
