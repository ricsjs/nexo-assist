import type { KbArticle } from "@nexo/domain";

// Busca por palavras-chave com pesos: tag vale mais que título, que vale mais que corpo.
// Com 8 artigos isso basta e não custa nada; com uma central grande, trocaria por embeddings.

const WEIGHTS = { tag: 3, title: 2, body: 1 } as const;

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
  "um", "uma", "para", "por", "com", "que", "meu", "minha", "nao", "esta", "estou", "ta", "se",
]);

// "Lentidão" e "lentidao" precisam bater: minúsculas e sem acento.
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface KbMatch {
  article: KbArticle;
  score: number;
}

export function rankArticles(articles: readonly KbArticle[], query: string, limit = 3): KbMatch[] {
  const terms = new Set(tokenize(query));
  if (terms.size === 0) return [];

  return articles
    .map((article) => {
      const tags = new Set(article.tags.flatMap(tokenize));
      const title = new Set(tokenize(article.title));
      const body = new Set(tokenize(article.body));
      let score = 0;
      for (const term of terms) {
        if (tags.has(term)) score += WEIGHTS.tag;
        if (title.has(term)) score += WEIGHTS.title;
        if (body.has(term)) score += WEIGHTS.body;
      }
      return { article, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
