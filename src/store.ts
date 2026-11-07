// Sessions live in process memory: Map<sessionId, Session>.
// Fine for a local POC; lost on restart and not shared between server copies.
// On AWS this becomes a DynamoDB table keyed by sessionId (see docs/aws-architecture).
import { EMPTY_PREFERENCES, type Preferences } from "./preferences.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: string[]; // article ids used for an assistant answer
}

export interface Session {
  id: string;
  messages: ChatMessage[];
  preferences: Preferences;
  createdAt: string;
}

const sessions = new Map<string, Session>();

export function getSession(id: string): Session {
  let s = sessions.get(id);
  if (!s) {
    s = { id, messages: [], preferences: structuredClone(EMPTY_PREFERENCES), createdAt: new Date().toISOString() };
    sessions.set(id, s);
  }
  return s;
}

export function resetSession(id: string): void {
  sessions.delete(id);
}
