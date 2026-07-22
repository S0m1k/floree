import { RecipeCategory } from '@/types';

// Desired display order of recipe categories. Matched by a distinctive keyword
// root (case-insensitive substring) rather than the exact title, so it keeps
// working regardless of the precise wording the POS uses
// ("Моно" → "Монобукеты", "Сборные" → "Сборные букеты", "Дополнения" →
// "Дополнения к букетам", "Свадебные" → "Свадебная флористика и декор", …).
const CATEGORY_ORDER_KEYWORDS = [
  'сезон', //     Сейчас сезон
  'моно', //      Монобукеты
  'сборн', //     Сборные букеты
  'премиум', //   Премиум букеты
  'свадеб', //    Свадебная флористика и декор
  'композиц', //  Цветочные композиции
  'охапк', //     Охапки
  'дополнени', // Дополнения к букетам
];

function rankOf(title: string): number {
  const normalized = title.trim().toLowerCase();
  const index = CATEGORY_ORDER_KEYWORDS.findIndex((kw) => normalized.includes(kw));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

// Return a sorted copy: known categories in CATEGORY_ORDER_KEYWORDS order, any
// unknown title kept in its original API order at the end (sort is stable).
export function orderCategories(cats: RecipeCategory[]): RecipeCategory[] {
  return [...cats].sort((a, b) => rankOf(a.attributes.title) - rankOf(b.attributes.title));
}

// Full category titles used as the offline / API-down fallback, already in the
// desired display order.
export const FALLBACK_CATEGORY_TITLES = [
  'Сейчас сезон',
  'Монобукеты',
  'Сборные букеты',
  'Премиум букеты',
  'Свадебная флористика и декор',
  'Цветочные композиции',
  'Охапки',
  'Дополнения к букетам',
];
