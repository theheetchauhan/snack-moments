import { getSnack } from "@/lib/study/protein";

export const BID_SNACK = "protein_bar";

/**
 * Model-implied max price for a snack vs the cheapest regular option (masala chips ₹20):
 * the price at which the player would be indifferent between the two.
 */
export function modelImpliedPrice(post: { mean: { a: number; bF: number; bC: number; c: number } }, ctx: "functional" | "craving", snackId = BID_SNACK) {
  const sn = getSnack(snackId);
  const ref = getSnack("masala_chips");
  const b = ctx === "functional" ? post.mean.bF : post.mean.bC;
  const a = Math.max(0.05, post.mean.a);
  const p = ref.basePrice + ((b * (sn.proteinG - ref.proteinG)) / 10 + post.mean.c * (sn.indulgence - ref.indulgence)) * (10 / a);
  return Math.max(0, Math.min(300, p));
}
