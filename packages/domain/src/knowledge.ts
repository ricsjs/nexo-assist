import { z } from "zod";
import { Category } from "./ticket.ts";

// Artigo da central de ajuda.
export const KbArticle = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  category: Category,
  tags: z.array(z.string()),
});
export type KbArticle = z.infer<typeof KbArticle>;
