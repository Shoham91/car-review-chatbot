// "Gradually infer user preferences": a small structured call before each agent turn.
// It sees the previous preferences + the latest exchange and returns the updated object.
// Kept separate from the agent on purpose: deterministic shape, easy to log, easy to test.
import { generateText, Output } from "ai";
import { z } from "zod";
import { getModel, reasoningOptions } from "./llm.js";

// Internal values stay in English (stable for code and evals); the UI gets Hebrew via preferencesForDisplay.
export const PRIORITIES = [
  "space", "comfort", "performance", "economy", "price", "luxury", "tech",
  "safety", "range", "reliability", "practicality", "driving-fun",
] as const;

const PRIORITY_HE: Record<(typeof PRIORITIES)[number], string> = {
  space: "מרחב", comfort: "נוחות", performance: "ביצועים", economy: "חיסכון בדלק/חשמל", price: "מחיר",
  luxury: "יוקרה", tech: "טכנולוגיה", safety: "בטיחות", range: "טווח", reliability: "אמינות",
  practicality: "שימושיות", "driving-fun": "הנאה מנהיגה",
};

const POWERTRAIN_HE = { electric: "חשמלי", "plug-in-hybrid": "היברידי נטען", hybrid: "היברידי", petrol: "בנזין" } as const;

export const PreferencesSchema = z.object({
  budgetMaxILS: z.number().nullable().describe("Max budget in NIS, if the user stated or clearly implied one"),
  powertrain: z
    .array(z.enum(["electric", "plug-in-hybrid", "hybrid", "petrol"]))
    .describe("Powertrains the user wants. Empty = no preference stated"),
  bodyType: z.array(z.string()).describe("In Hebrew, e.g. 'רכב פנאי', '7 מקומות', 'סדאן'"),
  passengers: z.number().nullable().describe("How many people usually ride, incl. driver"),
  priorities: z.array(z.enum(PRIORITIES)).describe("What matters most to the user"),
  dealBreakers: z.array(z.string()).describe("In Hebrew: things the user explicitly does not want"),
  usage: z.string().nullable().describe("In Hebrew: how the car will be used, e.g. 'טיולים משפחתיים', 'נסיעות בעיר'"),
  carsOfInterest: z.array(z.string()).describe("Catalog ids the user is currently focused on"),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export const EMPTY_PREFERENCES: Preferences = {
  budgetMaxILS: null, powertrain: [], bodyType: [], passengers: null,
  priorities: [], dealBreakers: [], usage: null, carsOfInterest: [],
};

export async function updatePreferences(
  previous: Preferences,
  userMessage: string,
  lastAssistantMessage: string | undefined,
  catalogIds: string[],
  modelId: string
): Promise<Preferences> {
  const { output } = await generateText({
    model: getModel(modelId),
    providerOptions: reasoningOptions(modelId, "minimal"),
    output: Output.object({ schema: PreferencesSchema }),
    instructions: [
      "You maintain a profile of a car buyer's preferences across a conversation.",
      "Return the FULL updated profile. Keep previous values unless the user changed or contradicted them.",
      "Only record what the user said or clearly implied (e.g. 'family with 3 kids' -> passengers 5, priority 'space').",
      "Never add a field value the user did not ask for: e.g. 3 kids does NOT mean '7 seats'; leave bodyType empty unless a body type was mentioned.",
      "Do not infer preferences from what the assistant said.",
      `carsOfInterest must use these ids only: ${catalogIds.join(", ")}.`,
      "Write free-text values (bodyType, dealBreakers, usage) in short Hebrew, whatever language the user writes in.",
    ].join("\n"),
    prompt: JSON.stringify({
      previousPreferences: previous,
      lastAssistantMessage: lastAssistantMessage?.slice(0, 1500) ?? null,
      newUserMessage: userMessage,
    }),
  });
  return output;
}

export const PREFERENCE_LABELS_HE: Record<keyof Preferences, string> = {
  budgetMaxILS: "תקציב", powertrain: "סוג הנעה", bodyType: "סוג רכב", passengers: "מספר נוסעים",
  priorities: "מה חשוב לך", dealBreakers: "מה לא", usage: "שימוש", carsOfInterest: "רכבים בפוקוס",
};

export function changedKeys(before: Preferences, after: Preferences): (keyof Preferences)[] {
  return (Object.keys(after) as (keyof Preferences)[]).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  );
}

/** Hebrew label/value rows for the "מה למדנו עליך" panel. Empty fields are skipped. */
export function preferencesForDisplay(p: Preferences, carName: (id: string) => string) {
  const rows: { label: string; value: string }[] = [];
  const add = (key: keyof Preferences, value: string | null) => {
    if (value) rows.push({ label: PREFERENCE_LABELS_HE[key], value });
  };
  add("budgetMaxILS", p.budgetMaxILS ? `עד ₪${p.budgetMaxILS.toLocaleString("en-US")}` : null);
  add("passengers", p.passengers ? `${p.passengers}` : null);
  add("powertrain", p.powertrain.map((x) => POWERTRAIN_HE[x]).join(", "));
  add("bodyType", p.bodyType.join(", "));
  add("priorities", p.priorities.map((x) => PRIORITY_HE[x]).join(", "));
  add("usage", p.usage);
  add("dealBreakers", p.dealBreakers.join(", "));
  add("carsOfInterest", p.carsOfInterest.map(carName).join(", "));
  return rows;
}

/** Field-level diff for logs and the UI. */
export function diffPreferences(before: Preferences, after: Preferences): string[] {
  return (Object.keys(after) as (keyof Preferences)[])
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${k}: ${JSON.stringify(before[k])} -> ${JSON.stringify(after[k])}`);
}
