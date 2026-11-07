import { z } from "zod";
import { ARTICLE_IDS, type ArticleId } from "./articles.config.js";

export const CarProfileSchema = z.object({
  id: z.enum(ARTICLE_IDS as [ArticleId, ...ArticleId[]]),
  url: z.string(),
  reviewDate: z.string(),
  name: z.string(),
  nameHe: z.string(),
  aliases: z.array(z.string()).describe("Other ways users may write the name in Hebrew or English, e.g. 'S6', 'אם ג׳י S6'"),
  reviewType: z.enum(["road-test", "long-term-report"]),
  bodyType: z.string().describe("e.g. 'רכב פנאי גדול, 7 מקומות' or 'סדאן ספורט'"),
  powertrain: z.string().describe("Engine/battery, power, drive, as stated in the article"),
  priceILS: z.number().nullable().describe("Base price in NIS from the spec table; null if not stated"),
  priceNote: z.string().nullable().describe("Price details stated in the text (trim levels etc.), or null"),
  keyNumbers: z.array(z.string()).describe("Up to 5 stated figures: 0-100, range, consumption, seats, trunk..."),
  pros: z.array(z.string()).max(5),
  cons: z.array(z.string()).max(5),
  bestFor: z.string().describe("Who the reviewer suggests the car suits, in one short sentence"),
  verdict: z.string().describe("The reviewer's bottom line, 1-2 sentences"),
});

export type CarProfile = z.infer<typeof CarProfileSchema>;
