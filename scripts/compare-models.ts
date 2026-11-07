// Replays the same multi-turn conversation on several models and prints replies side by side.
//   npm run compare -- gpt-5-mini gpt-5.4-mini gpt-4.1-mini
// Output: console + logs/compare-<timestamp>.md (for reading the Hebrew comfortably)
import fs from "node:fs";
import path from "node:path";
import { getSession } from "../src/store.js";
import { runTurn } from "../src/chat.js";

const CONVERSATION = [
  "יש לך איזו אודי להמליץ לי עליה?",
  "אני מעוניין בצריכת דלק, נוחות, אמינות ובטיחות",
  "אתה יכול להריץ השוואה בין כל הרכבים שאצלך ולהמליץ על הרכב הכי משתלם לפי המדדים שלי?",
];

const models = process.argv.slice(2).length ? process.argv.slice(2) : ["gpt-5-mini", "gpt-5.4-mini", "gpt-4.1-mini"];
const report: string[] = [`# Model comparison (${new Date().toISOString()})\n`];

for (const modelId of models) {
  const session = getSession(`compare-${modelId}-${Date.now()}`);
  report.push(`\n## ${modelId}\n`);
  for (const message of CONVERSATION) {
    const t = Date.now();
    try {
      const r = await runTurn(session, message, { modelId });
      const words = r.reply.split(/\s+/).length;
      const leakedEnglish = (r.reply.match(/\b(?!km|kWh|WLTP|NCAP|DC|SUV|PHEV|EV|GT|RS|HT|N)[A-Za-z]{4,}\b/g) ?? [])
        .filter((w) => !/^(Audi|Kia|Genesis|Lynk|Citro|Hyundai|Elantra|Aion|GAC|MG)/i.test(w));
      report.push(
        `**User:** ${message}\n\n_${Date.now() - t}ms · ${words} words · fetched [${r.fetchedIds.join(", ")}]` +
          `${leakedEnglish.length ? ` · English words: ${leakedEnglish.join(", ")}` : ""}_\n\n${r.reply}\n\n---\n`
      );
      console.log(`[compare] ${modelId} turn ${r.turn}: ${Date.now() - t}ms, ${words} words`);
    } catch (err) {
      report.push(`**User:** ${message}\n\nERROR: ${String(err)}\n\n---\n`);
      console.log(`[compare] ${modelId} failed: ${String(err).slice(0, 200)}`);
      break;
    }
  }
}

const file = path.join(process.cwd(), "logs", `compare-${Date.now()}.md`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, report.join("\n"));
console.log(`[compare] report -> ${file}`);
