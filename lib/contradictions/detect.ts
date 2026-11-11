/**
 * Contradictions are treated as research opportunities, not quality failures.
 * We find the strongest gap for this player, and ask ONE diagnostic follow-up whose
 * options are competing explanations. The answer becomes a finding.
 */
import type { Divergence } from "@/lib/scoring/signals";
import type { ContradictionType, FollowupData } from "@/lib/session/types";

interface Candidate {
  type: ContradictionType;
  strength: number;
  question: string;
  options: string[];
}

export const EXPLANATIONS: Record<Exclude<ContradictionType, "none">, string[]> = {
  stated_vs_revealed: [
    "Price — protein snacks cost too much for every day",
    "Taste — I pick what I feel like eating",
    "It depends on the moment (e.g. only after workouts)",
    "Protein options usually aren't around when I'm hungry",
  ],
  context_switch: [
    "After workouts I think about my body, late at night I don't",
    "Late night is about comfort, not nutrition",
    "I'm less hungry for 'real food' at night",
    "Honestly, no reason — it just happens",
  ],
  choice_vs_shelf: [
    "Budget felt tighter when I planned the whole week",
    "I buy protein snacks on the go, not to stock at home",
    "At home I'd rather have proper meals for protein",
    "I wanted variety on the shelf",
  ],
  squeeze_protein_first: [
    "Protein snacks are a 'nice to have' — first to go when money is tight",
    "They were the most expensive items, so cutting them saved most",
    "I can get protein from meals instead",
    "I'd keep my comfort snacks before anything else",
  ],
};

export function detectContradiction(d: Divergence): FollowupData {
  const c: Candidate[] = [];
  if (d.stated != null && d.stated >= 4 && d.revealedIndex <= 2.8) {
    c.push({
      type: "stated_vs_revealed",
      strength: (d.stated - d.revealedIndex) / 4,
      question: `You rated protein ${d.stated}/5, but in the game you mostly picked lower-protein snacks. What usually decides it for you?`,
      options: EXPLANATIONS.stated_vs_revealed,
    });
  }
  const rateGap = d.proteinRateFunctional != null && d.proteinRateCraving != null ? d.proteinRateFunctional - d.proteinRateCraving : null;
  // Needs BOTH: the observed choices differ by context AND the model is confident they do.
  if (rateGap != null && Math.abs(rateGap) >= 0.4 && (d.pContextSwitch ?? 0) >= 0.6) {
    const funcHigher = rateGap > 0;
    c.push({
      type: "context_switch",
      strength: Math.min(1, Math.abs(rateGap)),
      question: funcHigher
        ? "You paid extra for protein at your desk and after the gym, but not in late-night or fun moments. Why do you think that is?"
        : "You went for protein more in late-night / fun moments than during the day. Why do you think that is?",
      options: EXPLANATIONS.context_switch,
    });
  }
  if (d.choiceVsShelf != null && d.choiceVsShelf >= 0.3) {
    c.push({
      type: "choice_vs_shelf",
      strength: Math.min(1, d.choiceVsShelf),
      question: "In single moments you often chose protein, but when stocking the week you spent little on it. What changed?",
      options: EXPLANATIONS.choice_vs_shelf,
    });
  }
  if (d.squeezeProteinCutShare != null && d.squeezeProteinCutShare >= 0.7 && d.revealedIndex >= 3) {
    c.push({
      type: "squeeze_protein_first",
      strength: 0.55,
      question: "When your budget dropped, protein snacks were the first to go. Why those?",
      options: EXPLANATIONS.squeeze_protein_first,
    });
  }
  if (!c.length) {
    return { type: "none", question: "", options: [], answer: null, strength: 0 };
  }
  c.sort((a, b) => b.strength - a.strength);
  const top = c[0];
  return { type: top.type, question: top.question, options: top.options, answer: null, strength: Number(top.strength.toFixed(2)) };
}
