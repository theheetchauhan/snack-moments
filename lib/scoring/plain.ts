/**
 * Plain-English names for the warning signs and snack personalities, shared by the dashboard
 * tabs and the single-session page so they always use the same words.
 */
export const SIGN: Record<string, { name: string; meaning: string }> = {
  speed: { name: "Rushing", meaning: "answered faster than anyone could read the question" },
  position: { name: "Same screen spot", meaning: "kept tapping the same position, although cards are shuffled" },
  rhythm: { name: "Tapping in a rhythm", meaning: "a repeating order like top, middle, bottom" },
  repeat: { name: "Changed answer on the repeat", meaning: "a question came back and they flipped a clear choice" },
  dominated: { name: "Picked the overpriced twin", meaning: "chose the same snack at the higher price" },
  monotonicity: { name: "Illogical trade-offs", meaning: "e.g. paid more for less protein in the same situation" },
  surprise: { name: "Random choices", meaning: "their picks follow no consistent preference" },
  effort: { name: "Same speed on easy and hard", meaning: "didn't slow down when the choice got hard" },
  gut: { name: "Quick games too fast", meaning: "swiped or answered the memory game faster than readable" },
  week: { name: "Snack week doesn't add up", meaning: "the moments don't match their own weekly total" },
  text: { name: "Copied or junk text", meaning: "pasted or meaningless written answer" },
};

/** Snack personality, as the player sees it on their results card. */
export const DRIVER: Record<string, { title: string; emoji: string; line: string }> = {
  "price-led": { title: "Smart Spender", emoji: "🪙", line: "Price is the main filter. Protein wins only when it's a good deal." },
  "taste-led": { title: "Flavour Hunter", emoji: "😋", line: "Taste comes first. Protein is a bonus, not the reason." },
  "protein-led": { title: "Protein Loyalist", emoji: "💪", line: "Really pays for protein, in almost every moment." },
  "context-switcher": { title: "Context Switcher", emoji: "🔀", line: "Protein matters at the desk and the gym, but late at night comfort wins." },
  undecided: { title: "Balancer", emoji: "⚖️", line: "No single thing drives their choices. Price, taste and protein all pull a bit." },
};

/** Review decisions a person can save on a session. */
export const REVIEW: Record<string, { name: string; tone: "good" | "warn" | "bad" }> = {
  approve: { name: "Real player", tone: "good" },
  downweight: { name: "Partly careless", tone: "warn" },
  exclude: { name: "Fake or careless", tone: "bad" },
};

/** 1731000000000 → "7 Nov, 2:14pm" (UTC, so every viewer sees the same time). */
export function when(ts: number) {
  const d = new Date(ts);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const h = d.getUTCHours();
  return `${day}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
