// Browser side: keeps only a sessionId (localStorage). History and preferences live on the server.
const $messages = document.getElementById("messages");
const $form = document.getElementById("composer");
const $input = document.getElementById("input");
const $send = document.getElementById("send");
const $prefs = document.getElementById("prefs-list");
const $suggestions = document.getElementById("suggestions");

let sessionId = loadSessionId();
let carLinks = {}; // id -> url, learned from sources, used to link [id] citations

function loadSessionId() {
  let id = null;
  try { id = localStorage.getItem("sessionId"); } catch {}
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem("sessionId", id); } catch {}
  }
  return id;
}

// ---------- minimal, safe markdown (escape first, then format) ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([a-z0-9-]+)\]/g, (m, id) =>
      carLinks[id] ? `<a class="cite" href="${carLinks[id]}" target="_blank" rel="noopener">${id}</a>` : `<span class="cite">${id}</span>`
    );
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => inline(c.trim()));
      const body = rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r));
      const [head, ...rest] = body;
      out.push(
        `<div class="table-wrap"><table><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
          rest.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") +
          `</tbody></table></div>`
      );
      continue;
    }
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      out.push(`<p><strong>${inline(line.replace(/^#{1,4}\s+/, ""))}</strong></p>`);
    } else if (line.trim()) {
      out.push(`<p>${inline(line)}</p>`);
    }
    i++;
  }
  return out.join("");
}

// ---------- rendering ----------
function addMessage(role, content, sources, isError = false) {
  const el = document.createElement("div");
  el.className = `msg msg--${role === "user" ? "user" : "bot"}${isError ? " msg--error" : ""}`;
  el.dir = "auto";
  if (role === "user") {
    el.textContent = content;
  } else {
    (sources ?? []).forEach((s) => (carLinks[s.id] = s.url));
    el.innerHTML = renderMarkdown(content);
    if (sources?.length) {
      const src = document.createElement("div");
      src.className = "sources";
      src.innerHTML =
        "מקורות:" +
        sources.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a>`).join("");
      el.appendChild(src);
    }
  }
  $messages.appendChild(el);
  $messages.scrollTop = $messages.scrollHeight;
  return el;
}

// The server sends ready-to-show Hebrew rows: [{ label, value }].
function renderPreferences(rows) {
  if (!rows?.length) {
    $prefs.innerHTML = `<p class="prefs__empty">עדיין כלום. ספרו לי על התקציב, המשפחה או מה חשוב לכם.</p>`;
    return;
  }
  $prefs.innerHTML = rows
    .map((r) => `<dt>${escapeHtml(r.label)}</dt><dd dir="auto">${escapeHtml(r.value)}</dd>`)
    .join("");
}

// ---------- actions ----------
async function send(text) {
  const message = text.trim();
  if (!message) return;
  $suggestions.hidden = true;
  addMessage("user", message);
  $input.value = "";
  autoGrow();
  $send.disabled = true;
  const typing = addMessage("bot", "");
  const setStatus = (text) => (typing.innerHTML = `<span class="typing">${escapeHtml(text)}</span>`);
  setStatus("חושב…");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, message }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    // NDJSON stream: status lines update the placeholder live, the "done" line carries the answer.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "status") setStatus(event.text);
        else final = event;
      }
    }
    typing.remove();
    if (!final || final.type === "error") throw new Error(final?.error || "החיבור נקטע");
    addMessage("bot", final.reply, final.sources);
    renderPreferences(final.preferences);
  } catch (err) {
    typing.remove();
    addMessage("bot", `שגיאה: ${err.message}`, null, true);
  } finally {
    $send.disabled = false;
    $input.focus();
  }
}

async function restore() {
  try {
    const res = await fetch(`/api/session/${sessionId}`);
    const data = await res.json();
    if (data.messages?.length) {
      $suggestions.hidden = true;
      data.messages.forEach((m) => addMessage(m.role, m.content, m.sources));
    }
    renderPreferences(data.preferences);
  } catch {
    renderPreferences(null);
  }
}

function autoGrow() {
  $input.style.height = "auto";
  $input.style.height = Math.min($input.scrollHeight, 160) + "px";
}

$form.addEventListener("submit", (e) => {
  e.preventDefault();
  send($input.value);
});

$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send($input.value);
  }
});
$input.addEventListener("input", autoGrow);

$suggestions.addEventListener("click", (e) => {
  if (e.target.matches(".chip")) send(e.target.textContent);
});

document.getElementById("new-chat").addEventListener("click", async () => {
  await fetch(`/api/session/${sessionId}`, { method: "DELETE" }).catch(() => {});
  sessionId = crypto.randomUUID();
  try { localStorage.setItem("sessionId", sessionId); } catch {}
  $messages.innerHTML = "";
  $suggestions.hidden = false;
  renderPreferences(null);
  $input.focus();
});

restore();
