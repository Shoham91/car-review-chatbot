// One chat turn, shared by the HTTP server and the eval/compare scripts:
//   1. update preferences (small structured call)
//   2. run the agent (catalog + optional getArticles)
//   3. save to the session and log
import { DEFAULT_MODEL_ID, type Effort } from "./llm.js";
import { profiles } from "./catalog.js";
import type { Session } from "./store.js";
import {
  changedKeys, diffPreferences, PREFERENCE_LABELS_HE, preferencesForDisplay, updatePreferences,
} from "./preferences.js";
import { runAgent } from "./agent.js";
import { log, logTurn } from "./logger.js";

export interface TurnOptions {
  modelId?: string;
  onStatus?: (text: string) => void;
}

export async function runTurn(session: Session, userMessage: string, opts: TurnOptions = {}) {
  const modelId = opts.modelId ?? DEFAULT_MODEL_ID;
  const onStatus = opts.onStatus ?? (() => {});
  const turn = session.messages.filter((m) => m.role === "user").length + 1;
  // The first turn sets the direction of the conversation, so it gets more thinking.
  // Later turns use "low": at "none", gpt-5.4-mini tended to skip getArticles and answer
  // detail questions from the catalog summary only.
  const effort: Effort = turn === 1 ? "medium" : "low";
  log("chat", `session=${session.id.slice(0, 8)} turn=${turn} model=${modelId} effort=${effort} user: "${userMessage.slice(0, 120)}"`);

  const t0 = Date.now();
  onStatus("מבין מה חשוב לך…");
  const lastAssistant = [...session.messages].reverse().find((m) => m.role === "assistant")?.content;
  const prefsBefore = session.preferences;
  const prefsAfter = await updatePreferences(prefsBefore, userMessage, lastAssistant, profiles.map((p) => p.id), modelId);
  const prefsChanges = diffPreferences(prefsBefore, prefsAfter);
  const learned = changedKeys(prefsBefore, prefsAfter).filter((k) => k !== "carsOfInterest");
  if (prefsChanges.length) log("prefs", prefsChanges.join(" | "));
  onStatus(learned.length ? `רשמתי: ${learned.map((k) => PREFERENCE_LABELS_HE[k]).join(", ")}. עובר על הקטלוג…` : "עובר על הקטלוג…");
  const t1 = Date.now();

  const result = await runAgent(session.messages, userMessage, prefsAfter, { modelId, effort, onStatus });
  const t2 = Date.now();

  const sources = result.citedIds.length ? result.citedIds : result.fetchedIds;
  session.preferences = prefsAfter;
  session.messages.push({ role: "user", content: userMessage });
  session.messages.push({ role: "assistant", content: result.reply, sources });

  const latencyMs = { preferences: t1 - t0, agent: t2 - t1 };
  log(
    "agent",
    `steps=${result.steps} fetched=[${result.fetchedIds}] cited=[${result.citedIds}] ` +
      `tokens in=${result.usage.inputTokens} (cached ${result.usage.cachedInputTokens ?? 0}) out=${result.usage.outputTokens} ` +
      `(reasoning ${result.usage.reasoningTokens ?? 0}) time prefs=${latencyMs.preferences}ms agent=${latencyMs.agent}ms`
  );
  logTurn({
    sessionId: session.id, turn, model: modelId, effort, userMessage,
    preferencesBefore: prefsBefore, preferencesAfter: prefsAfter, preferenceChanges: prefsChanges,
    fetchedIds: result.fetchedIds, citedIds: result.citedIds, steps: result.steps,
    reply: result.reply, usage: result.usage, latencyMs,
  });

  return { reply: result.reply, sources, preferences: prefsAfter, fetchedIds: result.fetchedIds, latencyMs, turn };
}

export function displayPreferences(p: Session["preferences"]) {
  return preferencesForDisplay(p, (id) => profiles.find((x) => x.id === id)?.nameHe ?? id);
}

export function sourcesFor(ids: string[]) {
  return ids
    .map((id) => profiles.find((p) => p.id === id))
    .filter((p) => p !== undefined)
    .map((p) => ({ id: p.id, name: p.nameHe, url: p.url }));
}
