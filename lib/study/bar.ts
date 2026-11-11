/**
 * Build-a-Bar definitions, shared by the engine (server) and the game screen (client).
 * Level 0 is the plain baseline and is free; every level above it costs one recipe point.
 */
export const BAR_ATTRS = [
  { key: "protein", label: "Protein", emoji: "💪", levels: ["5g", "10g", "15g", "20g", "25g"] },
  { key: "lowSugar", label: "Less sugar", emoji: "🍬", levels: ["18g sugar", "12g sugar", "8g sugar", "4g sugar", "1g sugar"] },
  { key: "taste", label: "Indulgent taste", emoji: "😋", levels: ["Plain", "Okay", "Tasty", "Very tasty", "Dessert-level"] },
  { key: "lowPrice", label: "Lower price", emoji: "₹", levels: ["₹120", "₹100", "₹80", "₹60", "₹40"] },
  { key: "size", label: "Bigger size", emoji: "📏", levels: ["25g", "35g", "45g", "55g", "65g"] },
] as const;
export type BarAttrKey = (typeof BAR_ATTRS)[number]["key"];
export const BAR_KEYS: BarAttrKey[] = BAR_ATTRS.map((a) => a.key);
export const BAR_BUDGET = 10;
export const BAR_SQUEEZE = 7;
export const BAR_MAX_LEVEL = 4;

const BAR_WORD: Record<BarAttrKey, string> = { protein: "Iron", lowSugar: "Clean", taste: "Fudge", lowPrice: "Pocket", size: "Big-Bite" };

/** A fun name from what the player invested in most (ties broken by list order). */
export function barName(levels: Record<string, number>): string {
  const ranked = BAR_ATTRS.map((a, i) => ({ k: a.key, v: levels[a.key] ?? 0, i })).sort((x, y) => y.v - x.v || x.i - y.i);
  if (ranked[0].v === 0) return "The Plain Bar";
  const a = BAR_WORD[ranked[0].k];
  const b = ranked[1].v > 0 ? BAR_WORD[ranked[1].k] : null;
  return b ? `The ${a} ${b} Bar` : `The ${a} Bar`;
}
