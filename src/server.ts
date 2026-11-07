import express from "express";
import path from "node:path";
import { DEFAULT_MODEL_ID } from "./llm.js";
import { profiles } from "./catalog.js";
import { getSession, resetSession } from "./store.js";
import { displayPreferences, runTurn, sourcesFor } from "./chat.js";
import { log, logTurn } from "./logger.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3000);
const MAX_MESSAGE_CHARS = 2000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(process.cwd(), "public")));

const isValidSessionId = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(id);

// One chat turn. The response is NDJSON (one JSON object per line), streamed:
//   {"type":"status","text":"קורא את הכתבות על…"}   0..n live progress lines
//   {"type":"done","reply":…,"sources":…,"preferences":…}  or  {"type":"error","error":…}
// Plain HTTP chunked response: no WebSocket needed.
app.post("/api/chat", async (req, res) => {
  const { sessionId, message } = req.body ?? {};
  if (!isValidSessionId(sessionId)) return void res.status(400).json({ error: "invalid sessionId" });
  if (typeof message !== "string" || !message.trim()) return void res.status(400).json({ error: "message is required" });
  if (message.length > MAX_MESSAGE_CHARS) return void res.status(400).json({ error: "message too long" });

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  const send = (obj: object) => res.write(JSON.stringify(obj) + "\n");

  const session = getSession(sessionId);
  try {
    const result = await runTurn(session, message.trim(), { onStatus: (text) => send({ type: "status", text }) });
    send({ type: "done", reply: result.reply, sources: sourcesFor(result.sources), preferences: displayPreferences(result.preferences) });
  } catch (err) {
    log("error", `turn failed: ${err instanceof Error ? err.message : String(err)}`);
    logTurn({ sessionId, userMessage: message, error: String(err) });
    send({ type: "error", error: "משהו השתבש. נסו שוב בעוד רגע." });
  }
  res.end();
});

// Lets the browser re-render a conversation after a page refresh.
app.get("/api/session/:id", (req, res) => {
  if (!isValidSessionId(req.params.id)) return void res.status(400).json({ error: "invalid sessionId" });
  const s = getSession(req.params.id);
  res.json({
    messages: s.messages.map((m) => ({ ...m, sources: m.sources ? sourcesFor(m.sources) : undefined })),
    preferences: displayPreferences(s.preferences),
  });
});

app.delete("/api/session/:id", (req, res) => {
  if (isValidSessionId(req.params.id)) resetSession(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  log("server", `car review chatbot on http://localhost:${PORT} (model ${DEFAULT_MODEL_ID}, ${profiles.length} cars)`);
});
