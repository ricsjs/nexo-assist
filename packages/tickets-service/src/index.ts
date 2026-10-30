import { CATEGORIES, type Category } from "@nexo/domain";

export function listCategories(): readonly Category[] {
  return CATEGORIES;
}
