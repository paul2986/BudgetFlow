/** A fresh id for a budget, person, income, expense or toast: `<prefix>_<time>_<random>`. */
export const newId = (prefix: string): string =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
