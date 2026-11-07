// The 8 road-test articles from the assignment. The id is a stable, human-readable
// key used everywhere: file names, the getArticles tool, citations and logs.
// Names are set here, not by the LLM: 8 known cars, no reason to leave it to a model.
// keywords: brand + model words used to detect that a message is about this car. Each brand has
// exactly one car in this catalog, so a brand name alone ("אודי", "קיה") is unambiguous here.
export const ARTICLE_SOURCES = [
  { id: "citroen-c3", name: "Citroën C3", nameHe: "סיטרואן C3", keywords: ["סיטרואן", "citroen", "citroën", "c3"], url: "https://www.auto.co.il/articles/test-drives/road-tests/citroen-c3-2026/" },
  { id: "audi-rs3", name: "Audi RS3", nameHe: "אודי RS3", keywords: ["אודי", "audi", "rs3", "rs 3"], url: "https://www.auto.co.il/articles/test-drives/road-tests/audi-rs3-fl/" },
  { id: "kia-ev9", name: "Kia EV9", nameHe: "קיה EV9", keywords: ["קיה", "kia", "ev9"], url: "https://www.auto.co.il/articles/test-drives/road-tests/long-term-report-kia-ev9-4/" },
  { id: "mg-s6", name: "MG S6", nameHe: "אם.ג'י S6", keywords: ["mg", "אם.ג'י", "אם ג'י", "s6"], url: "https://www.auto.co.il/articles/test-drives/road-tests/mg-s6/" },
  { id: "hyundai-elantra-n", name: "Hyundai Elantra N", nameHe: "יונדאי אלנטרה N", keywords: ["יונדאי", "hyundai", "אלנטרה", "elantra"], url: "https://www.auto.co.il/articles/test-drives/road-tests/hyundai-elantra-n-manual/" },
  { id: "aion-ht", name: "GAC Aion HT", nameHe: "איון HT", keywords: ["איון", "aion", "הייפטק", "hyptec", "gac"], url: "https://www.auto.co.il/articles/test-drives/road-tests/aion-ht/" },
  { id: "lynk-co-01", name: "Lynk & Co 01", nameHe: "לינק אנד קו 01", keywords: ["לינק", "lynk"], url: "https://www.auto.co.il/articles/test-drives/road-tests/link-and-co-01-2026/" },
  { id: "genesis-gv80", name: "Genesis GV80", nameHe: "ג'נסיס GV80", keywords: ["ג'נסיס", "genesis", "gv80"], url: "https://www.auto.co.il/articles/test-drives/road-tests/genesis-gv80-2026/" },
] as const;

export type ArticleId = (typeof ARTICLE_SOURCES)[number]["id"];
export const ARTICLE_IDS = ARTICLE_SOURCES.map((s) => s.id) as ArticleId[];

export interface Article {
  id: ArticleId;
  url: string;
  title: string;
  subtitle: string;
  author: string;
  date: string;
  siteSummary: string; // the site's own short "AI summary" box, kept separately and labeled
  specs: { label: string; value: string }[];
  sections: { heading: string; text: string }[];
  charCount: number;
}
