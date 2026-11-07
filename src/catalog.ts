// The knowledge base, loaded once at startup from the files step 0 produced.
//   - profiles: short structured card per car -> always in the system prompt (the "catalog")
//   - articles: full cleaned text            -> fetched on demand by the getArticles tool
import fs from "node:fs";
import path from "node:path";
import { ARTICLE_IDS, ARTICLE_SOURCES, type Article, type ArticleId } from "./articles.config.js";
import type { CarProfile } from "./profile.schema.js";

const DATA_DIR = path.join(process.cwd(), "data");

export const profiles: CarProfile[] = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "profiles.json"), "utf8")
);

export const articles = new Map<ArticleId, Article>(
  ARTICLE_IDS.map((id) => [
    id,
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, "articles", `${id}.json`), "utf8")) as Article,
  ])
);

export function getProfile(id: ArticleId): CarProfile {
  return profiles.find((p) => p.id === id)!;
}

/**
 * Which catalog cars does a message name? Deterministic alias matching, so "if the user names a car,
 * we always read its article" doesn't depend on the model choosing to.
 * Long aliases match as substrings (survives Hebrew prefixes: "לאיון HT"); short ones ("S6", "EV9")
 * need a non-alphanumeric boundary. Pure-number aliases ("01") are ignored.
 */
export function detectMentionedCars(message: string): ArticleId[] {
  const text = message.toLowerCase().replace(/[׳']/g, "'");
  return profiles
    .filter((p) =>
      [p.name, p.nameHe, ...p.aliases, ...ARTICLE_SOURCES.find((s) => s.id === p.id)!.keywords].some((raw) => {
        const alias = raw.toLowerCase().replace(/[׳']/g, "'").trim();
        if (!alias || /^\d+$/.test(alias)) return false;
        if (alias.length >= 4) return text.includes(alias);
        const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(text);
      })
    )
    .map((p) => p.id);
}

const fmtPrice = (p: CarProfile) =>
  p.priceILS ? `₪${p.priceILS.toLocaleString("en-US")}` : "לא צוין בכתבה";

/** Compact catalog for the system prompt: enough to know what exists and answer light questions. */
export function catalogForPrompt(): string {
  return profiles
    .map((p) =>
      [
        `[${p.id}] ${p.name} / ${p.nameHe} (${p.reviewType === "long-term-report" ? "דוח מבחן ארוך-טווח" : "מבחן דרכים"}, ${p.reviewDate})`,
        `  aliases: ${p.aliases.join(", ")}`,
        `  סוג: ${p.bodyType} | הנעה: ${p.powertrain}`,
        `  מחיר: ${fmtPrice(p)}${p.priceNote ? ` (${p.priceNote})` : ""}`,
        p.keyNumbers.length ? `  נתונים: ${p.keyNumbers.join("; ")}` : `  נתונים: אין טבלת נתונים בכתבה`,
        `  יתרונות: ${p.pros.join("; ")}`,
        `  חסרונות: ${p.cons.join("; ")}`,
        `  מתאים ל: ${p.bestFor}`,
        `  שורה תחתונה: ${p.verdict}`,
      ].join("\n")
    )
    .join("\n\n");
}

/** Full article as the model sees it, wrapped so it is clearly data, not instructions. */
export function articleForPrompt(id: ArticleId): string {
  const a = articles.get(id)!;
  const body = [
    `כותרת: ${a.title}`,
    `תת-כותרת: ${a.subtitle}`,
    `כותב: ${a.author} | תאריך: ${a.date}`,
    a.specs.length ? `טבלת נתונים: ${a.specs.map((s) => `${s.label}: ${s.value}`).join("; ")}` : "טבלת נתונים: אין",
    ...a.sections.map((s) => `## ${s.heading}\n${s.text}`),
  ].join("\n\n");
  return `<article id="${id}" url="${a.url}">\n${body}\n</article>`;
}
