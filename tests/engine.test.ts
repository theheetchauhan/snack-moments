import { describe, expect, it } from "vitest";
import { simulateSession, TRUE_THETA, type Archetype } from "@/lib/simulate/agents";
import { fullScores } from "@/lib/session/engine";
import { updateCusum } from "@/lib/adaptive/selector";
import { anomalyEvidence } from "@/lib/timing/expected";

const NOW = 1_780_000_000_000;

function run(arch: Archetype, n: number) {
  return Array.from({ length: n }, (_, i) => simulateSession({ index: i + 1000 * arch.length, now: NOW, archetype: arch }).session);
}

describe("adaptive engine", () => {
  it("asks between 4 and 10 rounds and always includes quality probes", () => {
    for (const s of run("price_led", 8)) {
      expect(s.answers.length).toBeGreaterThanOrEqual(4);
      expect(s.answers.length).toBeLessThanOrEqual(10);
      expect(s.answers.some((a) => a.probe === "dominated")).toBe(true);
      expect(s.status).toBe("completed");
    }
  });

  it("recovers context-dependent willingness to pay (protein-led > price-led; switcher functional > craving)", () => {
    const med = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const prot = run("protein_led", 10).map((s) => s.posterior!.wtpFunctional.median);
    const price = run("price_led", 10).map((s) => s.posterior!.wtpFunctional.median);
    expect(med(prot)).toBeGreaterThan(med(price));
    const sw = run("context_switcher", 10);
    const gaps = sw.map((s) => s.posterior!.wtpFunctional.median - s.posterior!.wtpCraving.median);
    expect(med(gaps)).toBeGreaterThan(0.5);
    // true functional WTP for protein-led ≈ bF/a = 1.7/0.3 ≈ 5.7 ₹/g; the 80% interval should usually cover it
    const truth = TRUE_THETA.protein_led.bF / TRUE_THETA.protein_led.a;
    const covered = run("protein_led", 10).filter((s) => s.posterior!.wtpFunctional.lo <= truth * 1.4 && s.posterior!.wtpFunctional.hi >= truth * 0.6).length;
    expect(covered).toBeGreaterThanOrEqual(6);
  });
});

describe("CUSUM", () => {
  it("fires within 3 rushed answers", () => {
    let c = 0;
    let fired = -1;
    for (let i = 0; i < 3; i++) {
      c = updateCusum(c, anomalyEvidence({ residual: Math.log(0.2), samePositionAsPrevious: i > 0, chosenPredictiveProb: 0.3, nOptions: 3 }));
      if (c > 1.6 && fired < 0) fired = i;
    }
    expect(fired).toBeGreaterThanOrEqual(0);
  });
});

describe("quality vs divergence", () => {
  const bandShare = (arch: Archetype, band: string, n = 10) => run(arch, n).filter((s) => fullScores(s).quality.band === band).length / n;

  it("flags careless play (never green; red when 2+ independent signals agree)", () => {
    expect(bandShare("rusher", "green")).toBe(0);
    expect(bandShare("rusher", "red")).toBeGreaterThanOrEqual(0.4);
    expect(bandShare("position_tapper", "red")).toBeGreaterThanOrEqual(0.6);
    expect(bandShare("bot_ring", "green")).toBeLessThanOrEqual(0.2);
  });

  it("keeps genuine players green", () => {
    expect(bandShare("price_led", "green")).toBeGreaterThanOrEqual(0.7);
    expect(bandShare("context_switcher", "green")).toBeGreaterThanOrEqual(0.6);
  });

  it("does NOT penalise say-do contradictions — records them as findings", () => {
    const fakers = run("desirability_faker", 10);
    const green = fakers.filter((s) => fullScores(s).quality.band !== "red").length;
    expect(green).toBeGreaterThanOrEqual(8);
    const gaps = fakers.map((s) => fullScores(s).divergence.sayDoGap ?? 0);
    expect(gaps.filter((g) => g >= 1.5).length).toBeGreaterThanOrEqual(6);
    expect(fakers.filter((s) => s.followup?.type === "stated_vs_revealed").length).toBeGreaterThanOrEqual(5);
  });
});
