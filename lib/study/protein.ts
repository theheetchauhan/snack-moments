import { rngFrom, shuffle } from "@/lib/rng";
import type { Item, Moment, Snack, StudyDefinition } from "./types";

// Generic snacks (no real brands) so we measure protein, price and taste, not brand loyalty.
const NUTRITION: Record<string, [number, number]> = {
  masala_chips: [1, 270], choc_cookies: [18, 240], ice_cream: [20, 200], plain_makhana: [1, 150],
  roasted_chana: [1, 180], peanuts: [2, 290], greek_yogurt: [9, 140], boiled_eggs: [1, 150],
  protein_chips: [2, 200], protein_cookie: [8, 230], protein_bar: [6, 240], protein_shake: [5, 180],
};

export const SNACKS: Snack[] = ([
  { id: "masala_chips", name: "Masala chips", emoji: "🥔", proteinG: 3, indulgence: 0.9, basePrice: 20, tasteCue: "Spicy, crunchy, classic", virtuous: false },
  { id: "choc_cookies", name: "Choco-chip cookies", emoji: "🍪", proteinG: 2, indulgence: 1.0, basePrice: 30, tasteCue: "Gooey chocolate chunks", virtuous: false },
  { id: "ice_cream", name: "Ice cream cup", emoji: "🍨", proteinG: 3, indulgence: 1.0, basePrice: 50, tasteCue: "Creamy, cold, sweet", virtuous: false },
  { id: "plain_makhana", name: "Roasted makhana", emoji: "🍿", proteinG: 4, indulgence: 0.35, basePrice: 45, tasteCue: "Light, salted crunch", virtuous: false },
  { id: "roasted_chana", name: "Roasted chana", emoji: "🫘", proteinG: 7, indulgence: 0.3, basePrice: 25, tasteCue: "Nutty and savoury", virtuous: true },
  { id: "peanuts", name: "Masala peanuts", emoji: "🥜", proteinG: 8, indulgence: 0.55, basePrice: 40, tasteCue: "Spiced, salty crunch", virtuous: true },
  { id: "greek_yogurt", name: "Greek yogurt cup", emoji: "🥣", proteinG: 12, indulgence: 0.5, basePrice: 60, tasteCue: "Thick, fruity, creamy", virtuous: true },
  { id: "boiled_eggs", name: "Two boiled eggs", emoji: "🥚", proteinG: 12, indulgence: 0.15, basePrice: 30, tasteCue: "Simple, salt and pepper", virtuous: true },
  { id: "protein_chips", name: "Protein chips", emoji: "🍘", proteinG: 15, indulgence: 0.7, basePrice: 70, tasteCue: "Cheesy, crunchy, chip-like", virtuous: true },
  { id: "protein_cookie", name: "Protein cookie", emoji: "🥠", proteinG: 10, indulgence: 0.75, basePrice: 75, tasteCue: "Soft-baked, chocolatey", virtuous: true },
  { id: "protein_bar", name: "Chocolate protein bar", emoji: "🍫", proteinG: 20, indulgence: 0.6, basePrice: 90, tasteCue: "Chewy chocolate fudge", virtuous: true },
  { id: "protein_shake", name: "Ready-to-drink shake", emoji: "🥤", proteinG: 25, indulgence: 0.4, basePrice: 120, tasteCue: "Cold coffee flavour", virtuous: true },
] as Omit<Snack, "sugarG" | "kcal">[]).map((s) => ({ ...s, sugarG: NUTRITION[s.id][0], kcal: NUTRITION[s.id][1] }));

export const MOMENTS: Moment[] = [
  { id: "desk_430", label: "4:30pm at your desk", scene: "Long day, two hours to go, and you're hungry.", emoji: "💻", context: "functional" },
  { id: "post_gym", label: "Right after the gym", scene: "You just finished a workout and you're walking home.", emoji: "🏋️", context: "functional" },
  { id: "pre_meeting", label: "Before a big meeting", scene: "Ten minutes to go, you need something to keep you sharp.", emoji: "📋", context: "functional" },
  { id: "late_night", label: "11pm, can't sleep", scene: "The kitchen is calling. Quick-commerce is open.", emoji: "🌙", context: "craving" },
  { id: "movie_night", label: "Friday movie night", scene: "Friends are over and the movie is about to start.", emoji: "🎬", context: "craving" },
  { id: "road_trip", label: "Road-trip pit stop", scene: "Highway petrol pump, long drive ahead.", emoji: "🚗", context: "craving" },
];

const LOW = ["masala_chips", "choc_cookies", "ice_cream", "plain_makhana"];
const MID = ["roasted_chana", "peanuts", "boiled_eggs", "plain_makhana"];
const HIGH = ["protein_bar", "protein_chips", "protein_cookie", "greek_yogurt", "protein_shake"];
const PRICE_MULTIPLIERS = [0.7, 1, 1.35];

const snackById = new Map(SNACKS.map((s) => [s.id, s]));
export const getSnack = (id: string): Snack => {
  const s = snackById.get(id);
  if (!s) throw new Error(`unknown snack ${id}`);
  return s;
};

const roundPrice = (p: number) => Math.max(10, Math.round(p / 5) * 5);

function itemId(momentId: string, opts: { snackId: string; price: number }[]): string {
  return `${momentId}|${opts.map((o) => `${o.snackId}@${o.price}`).join(",")}`;
}

/** Deterministically generates the adaptive item bank (versioned with the study). */
function buildItems(): Item[] {
  const rng = rngFrom("protein-snack-moments:v1");
  const items: Item[] = [];
  for (const m of MOMENTS) {
    const combos: Item[] = [];
    for (const low of LOW) {
      for (const mid of MID) {
        if (mid === low) continue;
        for (const high of HIGH) {
          if (m.id !== "post_gym" && high === "protein_shake" && rng() < 0.5) continue;
          for (const mult of PRICE_MULTIPLIERS) {
            const options = [
              { snackId: low, price: getSnack(low).basePrice },
              { snackId: mid, price: getSnack(mid).basePrice },
              { snackId: high, price: roundPrice(getSnack(high).basePrice * mult) },
            ];
            combos.push({ id: itemId(m.id, options), momentId: m.id, options, format: "triad", probe: "none" });
          }
        }
      }
    }
    // Head-to-head duels: one protein snack vs one regular snack, protein premium varied.
    const duels: Item[] = [];
    for (const other of [...LOW, ...MID.filter((x) => !LOW.includes(x))]) {
      for (const high of HIGH) {
        for (const mult of PRICE_MULTIPLIERS) {
          const options = [
            { snackId: other, price: getSnack(other).basePrice },
            { snackId: high, price: roundPrice(getSnack(high).basePrice * mult) },
          ];
          duels.push({ id: itemId(m.id, options), momentId: m.id, options, format: "duel", probe: "none" });
        }
      }
    }
    // keep a manageable, varied bank per moment
    items.push(...shuffle(combos, rng).slice(0, 14), ...shuffle(duels, rng).slice(0, 8));
  }
  return items;
}

export const PROTEIN_STUDY: StudyDefinition = {
  id: "protein",
  version: 1,
  brand: "Macros (protein snacks)",
  title: "Snack Moments",
  originalQuestion: "When choosing a snack, how important is protein content to you? (1–5)",
  constructId: "protein_tradeoff",
  moments: MOMENTS,
  snacks: SNACKS,
  items: buildItems(),
};

export function getMoment(id: string): Moment {
  const m = MOMENTS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown moment ${id}`);
  return m;
}

const itemIndex = new Map(PROTEIN_STUDY.items.map((i) => [i.id, i]));

/** Resolves bank items and synthetic probe items (repeat / dominated) from their id. */
export function getItem(id: string): Item {
  const bank = itemIndex.get(id);
  if (bank) return bank;
  if (id.startsWith("repeat::")) {
    const orig = getItem(id.slice("repeat::".length));
    return { ...orig, id, probe: "repeat", repeatOf: orig.id };
  }
  if (id.startsWith("dominated::")) {
    // dominated::<moment>|<snack>@<price>,<snack>@<price>,<snack>@<price>|<dominatedIndex>
    const rest = id.slice("dominated::".length);
    const [momentId, optStr, dIdx] = rest.split("|");
    const options = optStr.split(",").map((s) => {
      const [snackId, price] = s.split("@");
      return { snackId, price: Number(price) };
    });
    return { id, momentId, options, format: "triad", probe: "dominated", dominatedIndex: Number(dIdx) };
  }
  throw new Error(`unknown item ${id}`);
}

/** Builds a dominated probe: same snack offered twice, one copy strictly more expensive. */
export function makeDominatedItem(momentId: string, rng: () => number): Item {
  const base = HIGH[Math.floor(rng() * HIGH.length)];
  const filler = LOW[Math.floor(rng() * LOW.length)];
  const p = getSnack(base).basePrice;
  const options = [
    { snackId: base, price: p },
    { snackId: base, price: roundPrice(p * 1.4) },
    { snackId: filler, price: getSnack(filler).basePrice },
  ];
  const id = `dominated::${momentId}|${options.map((o) => `${o.snackId}@${o.price}`).join(",")}|1`;
  return { id, momentId, options, format: "triad", probe: "dominated", dominatedIndex: 1 };
}
