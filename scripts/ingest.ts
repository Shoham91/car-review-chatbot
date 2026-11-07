// Step 0, part 1: download + clean. No LLM involved.
//   npm run ingest            -> uses cached HTML in data/raw if present
//   npm run ingest -- --fresh -> re-downloads every article
//
// Output: data/articles/<id>.json (structured, cleaned) and data/articles/<id>.txt (readable, for review)
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { ARTICLE_SOURCES, type Article } from "../src/articles.config.js";
import { cleanText } from "../src/text.js";

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const OUT_DIR = path.join(process.cwd(), "data", "articles");
const fresh = process.argv.includes("--fresh");

// cleanText strips invisible characters (zero-width, bidi overrides, Unicode tags) that can
// hide text from a human reader but not from an LLM: cheap prompt-injection hygiene.
const clean = cleanText;

async function getHtml(id: string, url: string): Promise<string> {
  const file = path.join(RAW_DIR, `${id}.html`);
  if (!fresh && fs.existsSync(file)) return fs.readFileSync(file, "utf8");

  console.log(`[ingest] fetching ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (car-review-chatbot POC)" } });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
  const html = await res.text();
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.writeFileSync(file, html);
  return html;
}

function isHidden($: cheerio.CheerioAPI, el: AnyNode): boolean {
  const $el = $(el);
  const style = ($el.attr("style") ?? "").replace(/\s/g, "").toLowerCase();
  return (
    $el.is("[hidden],[aria-hidden=true]") ||
    style.includes("display:none") ||
    style.includes("visibility:hidden") ||
    style.includes("font-size:0")
  );
}

function parseArticle(id: Article["id"], url: string, html: string): Article {
  const $ = cheerio.load(html);

  // Drop everything that is never reviewer content, before reading any text.
  $("script, style, noscript, iframe, video, picture, img, button, form, svg").remove();
  $(".section-banner, .banner, .whatsapp-section, .article-btns-image, .article-gallery").remove();
  $("#comments-section, [class*=comments]").remove(); // reader comments: not the reviewer, and untrusted
  $("*").each((_, el) => {
    if (isHidden($, el)) $(el).remove();
  });

  const title = clean($("h1").first().text());
  const subtitle = clean($(".heading__subtitle").first().text());
  const author = clean($(".article-meta .author__name").first().text());
  const date = $(".article-meta time").first().attr("datetime") ?? "";
  const siteSummary = clean($(".spollers__body").first().text());

  const specs: Article["specs"] = [];
  $(".vehicle-table__item").each((_, row) => {
    const label = clean($(row).find(".table-item__title").first().text());
    const value = clean($(row).find(".table-item__value").first().text());
    if (label && value) specs.push({ label, value });
  });

  // Body: every .text-wrapper in document order, stopping at the end-of-article tags block.
  // An <h2>/<h3> opens a new section; paragraphs, list items and table rows fill it.
  const sections: Article["sections"] = [];
  let current = { heading: "פתיחה", text: "" }; // "Introduction" for text before the first heading
  const flush = () => {
    if (current.text.trim()) sections.push({ heading: current.heading, text: current.text.trim() });
  };

  // Anything after the tags block (related articles, footer) is not part of the review.
  const allNodes = $("*").toArray();
  const endMarker = $(".tags.js-article-end").first()[0];
  const endIndex = endMarker ? allNodes.indexOf(endMarker) : Infinity;

  $(".text-wrapper").each((_, wrapper) => {
    if (allNodes.indexOf(wrapper) > endIndex) return;
    $(wrapper)
      .find("h2, h3, p, li, tr")
      .each((_, el) => {
        const tag = (el as { tagName?: string }).tagName?.toLowerCase();
        if (tag === "p" && $(el).parents("li, td, th").length) return; // avoid double counting
        const text =
          tag === "tr"
            ? $(el).find("th, td").toArray().map((c) => clean($(c).text())).filter(Boolean).join(" | ")
            : clean($(el).text());
        if (!text || /^צילום:/.test(text)) return; // photo credits
        // Some articles (e.g. Elantra N) use inline numbered headings instead of <h2>:
        // "3. אגרסיבית, צבע שחור וטעם. <paragraph...>"
        const inline = tag === "p" ? text.match(/^\d{1,2}\.\s+([^.?!]{2,60}[.?!])\s+(.*)$/s) : null;
        if (tag === "h2" || tag === "h3") {
          flush();
          current = { heading: text, text: "" };
        } else if (inline) {
          flush();
          current = { heading: inline[1].replace(/\.$/, ""), text: inline[2] + "\n" };
        } else {
          current.text += (tag === "li" ? "• " : "") + text + "\n";
        }
      });
  });
  flush();

  const charCount = sections.reduce((n, s) => n + s.heading.length + s.text.length, 0);
  return { id, url, title, subtitle, author, date, siteSummary, specs, sections, charCount };
}

function toReadableText(a: Article): string {
  const lines = [
    `# ${a.title}`,
    a.subtitle,
    `${a.author} | ${a.date} | ${a.url}`,
    "",
    "## נתונים (specs)",
    ...a.specs.map((s) => `- ${s.label}: ${s.value}`),
    "",
    "## סיכום האתר (site summary)",
    a.siteSummary,
    "",
    ...a.sections.flatMap((s) => [`## ${s.heading}`, s.text, ""]),
  ];
  return lines.join("\n");
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let totalChars = 0;
  for (const { id, url } of ARTICLE_SOURCES) {
    const html = await getHtml(id, url);
    const article = parseArticle(id, url, html);
    fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(article, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, `${id}.txt`), toReadableText(article));
    totalChars += article.charCount;

    const warn = [];
    if (!article.title) warn.push("no title");
    if (article.specs.length === 0) warn.push("no specs");
    if (article.sections.length < 3) warn.push(`only ${article.sections.length} sections`);
    console.log(
      `[ingest] ${id.padEnd(18)} sections=${String(article.sections.length).padStart(2)} specs=${String(article.specs.length).padStart(2)} chars=${article.charCount}` +
        (warn.length ? `  WARN: ${warn.join(", ")}` : "")
    );
  }
  console.log(`[ingest] done. total body chars=${totalChars}`);
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exit(1);
});
