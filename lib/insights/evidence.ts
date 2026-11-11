/**
 * Study belief state ("evidence board"). Each hypothesis is tested with a plain statistic and a
 * 95% CI. Status comes ONLY from the statistics; an LLM may later narrate it, never decide it.
 */
import type { CI } from "@/lib/admin/stats";

export type Status = "supported" | "contradicted" | "open";

export interface Hypothesis {
  id: string;
  statement: string;
  test: string;
  direction: "positive" | "negative" | "zero";
  ci: CI;
  unit: string;
  status: Status;
  confidence: "low" | "medium" | "high";
  evidence: string;
  nextExperiment: string;
  source: "design" | "studio";
}

function judge(ci: CI, direction: Hypothesis["direction"], minN = 20): { status: Status; confidence: Hypothesis["confidence"] } {
  if (!Number.isFinite(ci.estimate) || ci.n < minN) return { status: "open", confidence: "low" };
  let status: Status = "open";
  if (direction === "positive") status = ci.lo > 0 ? "supported" : ci.hi < 0 ? "contradicted" : "open";
  if (direction === "negative") status = ci.hi < 0 ? "supported" : ci.lo > 0 ? "contradicted" : "open";
  if (direction === "zero") status = ci.lo <= 0 && ci.hi >= 0 ? "supported" : "contradicted";
  const width = ci.hi - ci.lo;
  const scale = Math.max(Math.abs(ci.estimate), 1e-6);
  const confidence = ci.n >= 150 && width < scale ? "high" : ci.n >= 60 ? "medium" : "low";
  return { status, confidence };
}

export function buildEvidence(x: {
  sayDo: CI;
  contextGap: CI;
  framing: CI;
  labelGap: CI;
  gutVsChoice: CI;
  bidVsModel: CI;
  anchoring: CI;
  giftEffect: CI;
  priceVsTaste: CI;
  designVsChoice: CI;
  weekFunctional: CI;
}): Hypothesis[] {
  const x100 = (c: CI): CI => ({ ...c, estimate: c.estimate * 100, lo: c.lo * 100, hi: c.hi * 100 });
  x = { ...x, framing: x100(x.framing), labelGap: x100(x.labelGap), gutVsChoice: x100(x.gutVsChoice), giftEffect: x100(x.giftEffect), priceVsTaste: x100(x.priceVsTaste) };
  const f = (c: CI, d = 2) => (Number.isFinite(c.estimate) ? `${c.estimate.toFixed(d)} [${c.lo.toFixed(d)}, ${c.hi.toFixed(d)}], n=${c.n}` : "not enough data");
  const H = (h: Omit<Hypothesis, "status" | "confidence" | "source">): Hypothesis => ({ ...h, ...judge(h.ci, h.direction), source: "design" });
  return [
    H({
      id: "H1",
      statement: "People overstate how much protein drives their snack choices.",
      test: "Compare each player's 1–5 rating with the rating their choices point to. Proven if ratings are clearly higher on average.",
      direction: "positive",
      ci: x.sayDo,
      unit: "points on the 1–5 scale",
      evidence: `Say–do gap ${f(x.sayDo)} points on the 1–5 scale.`,
      nextExperiment: "Split the gap by segment; test whether anonymity mode shrinks it (A/B).",
    }),
    H({
      id: "H2",
      statement: "People pick protein more at the desk, gym or before a meeting than late at night, at a movie or on a road trip.",
      test: "For each player, compare how often they picked protein at the desk, gym or before a meeting with late at night, at a movie or on a road trip.",
      direction: "positive",
      ci: x.contextGap,
      unit: "percentage points",
      evidence: `Functional − craving protein pick rate ${f(x.contextGap)}.`,
      nextExperiment: "Add more craving-moment items with cheap protein to see if price or context drives the gap.",
    }),
    H({
      id: "H3",
      statement: "Cards that highlight protein make people pick protein more often.",
      test: "Players were randomly shown cards highlighting protein or taste. Compare how often each group picked the protein snack.",
      direction: "positive",
      ci: x.framing,
      unit: "percentage points",
      evidence: `Framing effect ${f(x.framing, 1)} percentage points.`,
      nextExperiment: "Validate in the field: quick-commerce listing A/B with the two pack claims.",
    }),
    H({
      id: "H4",
      statement: "Shoppers notice price on a pack more than protein.",
      test: "In Label Detective, compare how many players remembered the price with how many remembered the protein on a pack.",
      direction: "positive",
      ci: x.labelGap,
      unit: "percentage points",
      evidence: `Recall gap ${f(x.labelGap, 1)}.`,
      nextExperiment: "Test pack layouts that put grams of protein next to the price.",
    }),
    H({
      id: "H5",
      statement: "Protein snacks look more appealing at first glance than they turn out when people actually choose.",
      test: "Compare how often players swiped 'yes' on protein snacks in Gut Check with how often they picked protein in Snack Moments.",
      direction: "positive",
      ci: x.gutVsChoice,
      unit: "percentage points",
      evidence: `Gut − considered ${f(x.gutVsChoice, 1)}.`,
      nextExperiment: "Find the price where gut appeal converts to choice (vary price on Gut Check cards).",
    }),
    H({
      id: "H6",
      statement: "When asked to bid, people offer more for a protein bar than their choices show it is worth to them.",
      test: "Compare each player's Bid It bid for a protein bar with the price their own choices suggest it is worth to them.",
      direction: "positive",
      ci: x.bidVsModel,
      unit: "₹",
      evidence: `Bid − model ${f(x.bidVsModel, 1)} ₹.`,
      nextExperiment: "Run Bid It with a real voucher payout so the BDM becomes incentive-compatible.",
    }),
    H({
      id: "H7",
      statement: "Seeing an expensive protein snack first makes people willing to pay more for protein.",
      test: "Players were randomly shown a pricey or a cheap protein snack first. Compare what 1g of protein is worth to each group.",
      direction: "positive",
      ci: x.anchoring,
      unit: "₹ per gram",
      evidence: `Anchor effect ${f(x.anchoring)} ₹/g.`,
      nextExperiment: "If supported, randomise the first item for every study to wash anchoring out of estimates.",
    }),
    H({
      id: "H8",
      statement: "A bigger surprise gift reduces rushing in the games that follow.",
      test: "The mystery gift size is random. Compare how often big-gift and small-gift players rushed their answers afterwards.",
      direction: "negative",
      ci: x.giftEffect,
      unit: "percentage points",
      evidence: `Gift effect on rushing ${f(x.giftEffect, 1)}.`,
      nextExperiment: "Move gifts earlier or later and compare completion as well as rushing.",
    }),
    H({
      id: "H9",
      statement: "When people who 'care about protein' skip it, price is the reason more often than taste.",
      test: "Among players who rated protein highly but skipped it, check whether they blame price more often than taste.",
      direction: "positive",
      ci: x.priceVsTaste,
      unit: "points above 50%",
      evidence: `Price share minus 50% ${f(x.priceVsTaste, 1)}.`,
      nextExperiment: "Test a smaller, cheaper pack size against the current one.",
    }),
    H({
      id: "H10",
      statement: "When people design their ideal bar, they ask for more protein than their own choices show they value.",
      test: "Compare how much protein each player put into their designed bar with how much protein mattered in their actual choices.",
      direction: "positive",
      ci: x.designVsChoice,
      unit: "percentage points",
      evidence: `Design − choice ${f(x.designVsChoice, 1)} percentage points.`,
      nextExperiment: "Show two real bar concepts (design-led vs choice-led) in a choice task to see which one sells.",
    }),
    H({
      id: "H11",
      statement: "Most weekly snack moments are at the desk, gym or before a meeting, not cravings.",
      test: "From My Snack Week, check whether more than half of weekly snack moments are functional (desk, gym, meeting).",
      direction: "positive",
      ci: x.weekFunctional,
      unit: "points above 50%",
      evidence: `Functional share minus 50% ${f(x.weekFunctional, 1)}.`,
      nextExperiment: "Check against real quick-commerce order times by hour of day.",
    }),
  ];
}
