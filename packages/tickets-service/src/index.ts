import { CATEGORY_LABEL, Category } from "@nexo/domain";

export function listCategories(): string[] {
  return Category.options.map((c) => CATEGORY_LABEL[c]);
}
