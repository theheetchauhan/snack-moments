import { describe, expect, it } from "vitest";
import { simulateSession, type Archetype } from "@/lib/simulate/agents";
import { addToCoverage, decide, emptyCoverage, postValues, preValues, TARGET_SHARE, OPTIONAL_GAMES } from "@/lib/adaptive/rotation";
import { fullScores, sessionPlan, BAR_BUDGET, BAR_SQUEEZE } from "@/lib/session/engine";
import { rngFrom } from "@/lib/rng";

const NOW = 1_790_000_000_000;

describe("optional-game rotation", () => {
  it("stores exact propensities: each between ε-floor and 1, summing to the number of games picked", () => {
    const pre = decide("pre", preValues({ labelProteinCorrect: false, gutMedianMs: 600, gutProteinLikeRate: 0.2, segment: "25–34 working" }), 1, null, rngFrom("t1"));
    const post = decide("post", postValues({ posterior: null, cusum: 0 }), 1, null, rngFrom("t2"));
    for (const [d, k] of [[pre, 1], [post, 1]] as const) {
      const sum = d.scores.reduce((a, x) => a + x.prob, 0);
      expect(sum).toBeCloseTo(k, 3);
      for (const x of d.scores) {
        expect(x.prob).toBeGreaterThan(0.05);
        expect(x.prob).toBeLessThanOrEqual(1);
      }
      expect(d.picked.length).toBe(k);
    }
  });

  it("uses judgment: someone who missed the protein detail and swiped on instinct is more likely to get Peek & Pick", () => {
    const vals = preValues({ labelProteinCorrect: false, gutMedianMs: 600, gutProteinLikeRate: 0, segment: "18–24 student" });
    const d = decide("pre", vals, 1, null, rngFrom("t3"));
    const peek = d.scores.find((x) => x.game === "peek")!;
    expect(peek.prob).toBeGreaterThan(0.75);
    expect(peek.reasons.length).toBeGreaterThan(1);
  });

  it("balances coverage: an under-served game gets a boost", () => {
    const cov = emptyCoverage();
    cov.week = { assigned: 5, eligible: 100 }; // week badly under target
    cov.peek = { assigned: 95, eligible: 100 };
    const vals = preValues({ labelProteinCorrect: false, gutMedianMs: 600, gutProteinLikeRate: 0, segment: "18–24 student" });
    const balanced = decide("pre", vals, 1, cov, rngFrom("t4"));
    expect(balanced.scores.find((x) => x.game === "week")!.prob).toBeGreaterThan(0.5);
  });

  it("keeps every game near its target share across a simulated sample, and every session plays 2 optional games", () => {
    const cov = emptyCoverage();
    const sessions = Array.from({ length: 150 }, (_, i) => {
      const s = simulateSession({ index: 5000 + i, now: NOW, coverage: cov }).session;
      addToCoverage(cov, [s.rotation.pre, s.rotation.post]);
      return s;
    });
    for (const g of OPTIONAL_GAMES) {
      const share = cov[g].assigned / cov[g].eligible;
      expect(Math.abs(share - TARGET_SHARE[g])).toBeLessThan(0.12);
    }
    for (const s of sessions) {
      expect(s.status).toBe("completed");
      const played = [s.peek?.choice ? "peek" : null, s.week ? "week" : null, s.bid ? "bid" : null, s.shelf ? "shelf" : null, s.bar ? "bar" : null].filter(Boolean);
      expect(played.length).toBe(2);
      expect(sessionPlan(s).some((p) => p.key === "mystery")).toBe(false);
    }
  });
});

describe("new games", () => {
  const run = (arch: Archetype, n: number) =>
    Array.from({ length: n * 3 }, (_, i) => simulateSession({ index: 7000 + i + arch.length * 100, now: NOW, archetype: arch }).session).filter((s) => s.bar);

  it("Build-a-Bar spends exactly 10 points, keeps 7 after the squeeze, and names the bar", () => {
    for (const s of run("price_led", 4)) {
      expect(Object.values(s.bar!.alloc).reduce((a, b) => a + b, 0)).toBe(BAR_BUDGET);
      expect(Object.values(s.bar!.final).reduce((a, b) => a + b, 0)).toBe(BAR_SQUEEZE);
      expect(s.bar!.name).toMatch(/^The .+ Bar$/);
    }
  });

  it("design-vs-choice shows desirability fakers designing a 'healthier' bar than they choose (a finding, not a penalty)", () => {
    const fakers = run("desirability_faker", 6).map((s) => fullScores(s).divergence.designVsChoice!);
    const honest = run("price_led", 6).map((s) => fullScores(s).divergence.designVsChoice!);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(fakers)).toBeGreaterThan(avg(honest) + 0.1);
  });

  it("My Snack Week is consistent for genuine players and its check stays a weak signal", () => {
    const xs = Array.from({ length: 30 }, (_, i) => simulateSession({ index: 9000 + i, now: NOW, archetype: "taste_led" }).session).filter((s) => s.week);
    expect(xs.length).toBeGreaterThan(5);
    const ok = xs.filter((s) => s.week!.consistency! > 0.55 && s.week!.consistency! < 1.8).length;
    expect(ok / xs.length).toBeGreaterThanOrEqual(0.7);
    const sig = fullScores(xs[0]).quality.signals.find((x) => x.key === "week")!;
    expect(sig.weak).toBe(true);
  });
});

describe("rewards", () => {
  it("caps bonus points at BONUS_CAP for the whole game; progress points still count", async () => {
    const { bonusPoints, BONUS_CAP, settleRewards } = await import("@/lib/session/engine");
    for (let i = 0; i < 40; i++) {
      const s = simulateSession({ index: 11000 + i, now: NOW }).session;
      settleRewards(s, { crowdShare: s.crowd?.guessPct ?? null, bonusShares: [60, 60] }, "green"); // best-case settlement
      expect(bonusPoints(s)).toBeLessThanOrEqual(BONUS_CAP);
      expect(s.points).toBeLessThanOrEqual(250);
      expect(s.rewards.some((r) => r.kind === "progress")).toBe(true);
    }
  });
});
