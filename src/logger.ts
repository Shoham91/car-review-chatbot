// Two outputs: readable console lines while developing, and one JSON line per turn in
// logs/turns.jsonl for evals and debugging. On AWS, stdout goes to CloudWatch Logs as-is.
import fs from "node:fs";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "logs", "turns.jsonl");

export function log(scope: string, message: string): void {
  console.log(`${new Date().toISOString().slice(11, 19)} [${scope}] ${message}`);
}

export function logTurn(entry: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}
