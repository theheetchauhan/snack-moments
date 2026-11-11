/**
 * Builds every admin dashboard section from stored sessions + versioned scores.
 * All numbers are computed here with plain statistics (no LLM involved).
 */
import { loadStudy } from "@/lib/session/repo";
import { getItem, getMoment, getSnack, PROTEIN_STUDY } from "@/lib/study/protein";
import type { SessionData } from "@/lib/session/types";
import type { Divergence, Signal } from "@/lib/scoring/signals";
import { NOISE_WEIGHTS, positionEntropy, lzComplexity } from "@/lib/scoring/signals";
import { modelImpliedPrice } from "@/lib/model/price";
import { buildEvidence } from "@/lib/insights/evidence";
import { countBy, diffCI, histogram, kmeans, mean, meanCI, median, pca2, quantile, round, standardise, weightedMeanCI, type CI } from "./stats";
import { GAME_NAME, OPTIONAL_GAMES, PRE_GAMES, TARGET_SHARE, type OptionalGame } from "@/lib/adaptive/rotation";
import { BAR_ATTRS } from "@/lib/study/bar";
import { MOMENTS } from "@/lib/study/protein";
import { normaliseSession } from "@/lib/session/repo";

export interface Filters {
  source: "all" | "real" | "simulated";
  segment: string | "all";
  framing: "all" | "health" | "taste";
}

const BAND_NAME = { green: "High quality players", amber: "Medium quality players", red: "Low quality players" } as const;

type Row = {
  s: SessionData;
  score: {
    quality: number;
    band: string;
    weight: number;
    engagement: number;
    signals: Signal[];
    divergence: Divergence;
    engagementParts: Record<string, number>;
    aiExplanation: string | null;
  } | null;
};

// Core steps only: optional games are rotated, so they are not a straight funnel (see the Game rotation tab).
const FUNNEL = [
  { key: "started", label: "Started" },
  { key: "label", label: "Label detective" },
  { key: "gut", label: "Gut check" },
  { key: "rounds", label: "Snack Moments" },
  { key: "crowd", label: "Guess the crowd" },
  { key: "reality", label: "Reality check" },
  { key: "stated", label: "1–5 rating" },
  { key: "completed", label: "Follow-up question & finish" },
];

function reached(s: SessionData, key: string): boolean {
  switch (key) {
    case "started":
      return true;
    case "label":
      return !!s.label;
    case "gut":
      return !!s.gut;
    case "peek":
      return !!s.peek?.choice;
    case "bid":
      return !!s.bid;
    case "bonus":
      return !!s.bonus;
    case "rounds":
      return !!s.posterior && (s.stage !== "rounds" || s.status === "completed");
    case "shelf":
      return !!s.shelf;
    case "crowd":
      return !!s.crowd;
    case "reality":
      return !!s.reality;
    case "stated":
      return s.stated != null;
    case "completed":
      return s.status === "completed";
  }
  return false;
}

const isTop = (a: SessionData["answers"][number]) => {
  const it = getItem(a.itemId);
  const prot = it.options.map((o) => getSnack(o.snackId).proteinG);
  return prot[a.chosenIndex] === Math.max(...prot);
};

export async function buildAdmin(studyId: string, f: Filters) {
  const { sessions, scores, labels, participants } = await loadStudy(studyId);
  const scoreBy = new Map(scores.map((x) => [x.sessionId, x]));
  let rows: Row[] = sessions.map((r) => ({ s: normaliseSession(r.data), score: (scoreBy.get(r.id) as Row["score"]) ?? null }));
  const totalAll = rows.length;
  const segments = [...new Set(rows.map((r) => r.s.segment))].sort();
  if (f.source !== "all") rows = rows.filter((r) => (f.source === "simulated" ? r.s.simulated : !r.s.simulated));
  if (f.segment !== "all") rows = rows.filter((r) => r.s.segment === f.segment);
  if (f.framing !== "all") rows = rows.filter((r) => r.s.framing === f.framing);

  const done = rows.filter((r) => r.s.status === "completed" && r.score);
  const usable = done.filter((r) => (r.score?.weight ?? 0) > 0); // insight stats exclude red
  const answers = done.flatMap((r) => r.s.answers.map((a) => ({ a, r })));

  // ---------- A. Overview ----------
  const durations = done.filter((r) => r.s.completedAt).map((r) => (r.s.completedAt! - r.s.startedAt) / 60000);
  const bandCounts = countBy(done, (r) => r.score!.band);
  // each day's sessions split by outcome: high / medium / low quality / didn't finish
  const byDay = new Map<string, { day: string; label: string; started: number; completed: number; green: number; amber: number; red: number; unfinished: number }>();
  for (const r of rows) {
    const d = new Date(r.s.startedAt);
    const day = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const e = byDay.get(day) ?? { day, label, started: 0, completed: 0, green: 0, amber: 0, red: 0, unfinished: 0 };
    e.started++;
    if (r.s.status === "completed" && r.score) {
      e.completed++;
      e[r.score.band as "green" | "amber" | "red"]++;
    } else e.unfinished++;
    byDay.set(day, e);
  }
  const reviewed = new Set(labels.map((l) => l.sessionId));
  const overview = {
    totalAll,
    started: rows.length,
    completed: done.length,
    completionRate: rows.length ? done.length / rows.length : 0,
    medianMinutes: round(median(durations), 1),
    medianRounds: round(median(done.map((r) => r.s.answers.length)), 1),
    simulatedShare: rows.length ? rows.filter((r) => r.s.simulated).length / rows.length : 0,
    avgQuality: round(mean(done.map((r) => r.score!.quality)), 0),
    avgEngagement: round(mean(done.map((r) => r.score!.engagement)), 0),
    qualityHist: histogram(
      done.map((r) => r.score!.quality),
      0,
      100,
      10,
      (x) => `${x}`,
    ),
    bands: ["green", "amber", "red"].map((b) => ({ band: b, count: bandCounts[b] ?? 0 })),
    perDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    needsReview: done.filter((r) => r.score!.band === "red" && !reviewed.has(r.s.id)).length,
    usableShare: done.length ? usable.length / done.length : 0,
  };

  // ---------- B. Funnel ----------
  const funnel = FUNNEL.map((st) => ({ step: st.label, count: rows.filter((r) => reached(r.s, st.key)).length }));
  const abandoned = rows.filter((r) => r.s.status !== "completed");
  const dropByRound = Object.entries(
    countBy(
      abandoned.filter((r) => r.s.stage === "rounds"),
      (r) => String(r.s.answers.length + 1),
    ),
  )
    .map(([round, count]) => ({ round: `R${round}`, count }))
    .sort((a, b) => Number(a.round.slice(1)) - Number(b.round.slice(1)));
  const roundsHist = Array.from({ length: 7 }, (_, i) => ({ rounds: String(i + 4), count: done.filter((r) => r.s.answers.length === i + 4).length }));
  const survival = Array.from({ length: 10 }, (_, i) => ({
    round: i + 1,
    stillPlaying: rows.length ? rows.filter((r) => r.s.answers.length >= i + 1 && !(r.s.status === "completed" && r.s.answers.length === i)).length / rows.length : 0,
  }));
  const stopReasons = Object.entries(countBy(done, (r) => r.s.stopReason ?? "unknown")).map(([reason, count]) => ({ reason, count }));
  // questions needed in Snack Moments, split by why the engine stopped asking
  const stopKey = (x?: string) => (x === "stop-converged" ? "confident" : x === "stop-low-information" ? "noMoreToLearn" : x === "stop-max-rounds" ? "limit" : "other");
  const roundsByReason = Array.from({ length: 7 }, (_, i) => {
    const xs = done.filter((r) => r.s.answers.length === i + 4);
    return {
      questions: String(i + 4),
      confident: xs.filter((r) => stopKey(r.s.stopReason) === "confident").length,
      noMoreToLearn: xs.filter((r) => stopKey(r.s.stopReason) === "noMoreToLearn").length,
      limit: xs.filter((r) => stopKey(r.s.stopReason) === "limit").length,
      other: xs.filter((r) => stopKey(r.s.stopReason) === "other").length,
    };
  });
  // where people quit inside Snack Moments (question number they were on)
  const quitByQuestion = Array.from({ length: 10 }, (_, i) => ({
    question: String(i + 1),
    quit: abandoned.filter((r) => r.s.stage === "rounds" && r.s.answers.length + 1 === i + 1).length,
  }));

  // ---------- C. Timing ----------
  const timingByMoment = PROTEIN_STUDY.moments.map((m) => {
    const xs = answers.filter((x) => x.a.momentId === m.id).map((x) => x.a.latencyMs / 1000);
    return {
      moment: m.label.replace(/^(.{14}).+$/, "$1…"),
      q1: round(quantile(xs, 0.25), 1),
      med: round(median(xs), 1),
      q3: round(quantile(xs, 0.75), 1),
      p10: round(quantile(xs, 0.1), 1),
      p90: round(quantile(xs, 0.9), 1),
      n: xs.length,
    };
  });
  const scatterSample = answers.filter((_, i) => i % Math.max(1, Math.floor(answers.length / 500)) === 0);
  const expectedVsActual = scatterSample.map((x) => ({ expected: round(x.a.expectedMs / 1000, 1), actual: round(Math.min(40, x.a.latencyMs / 1000), 1), band: x.r.score!.band }));
  const residualHist = histogram(
    answers.map((x) => x.a.residual),
    -3,
    2,
    20,
    (v) => v.toFixed(1),
  );
  const speedConsistency = done.map((r) => {
    const surprise = r.score!.signals.find((x) => x.key === "surprise");
    return {
      id: r.s.id,
      speed: round(median(r.s.answers.map((a) => a.residual)), 2),
      consistency: round((surprise?.value as number) ?? 1, 2),
      band: r.score!.band,
    };
  });
  // answers grouped by speed: time taken as a share of the time that choice needs
  const ratioOf = (x: { a: { residual: number } }) => Math.exp(x.a.residual);
  const SPEED_BANDS = [
    { key: "rushing", label: "Under 35%", lo: 0, hi: 0.35 },
    { key: "quick", label: "35–60%", lo: 0.35, hi: 0.6 },
    { key: "normal", label: "60–150%", lo: 0.6, hi: 1.5 },
    { key: "slow", label: "150–300%", lo: 1.5, hi: 3 },
    { key: "verySlow", label: "Over 300%", lo: 3, hi: Infinity },
  ];
  const speedBands = SPEED_BANDS.map((b) => ({ ...b, answers: answers.filter((x) => ratioOf(x) >= b.lo && ratioOf(x) < b.hi).length }));
  const rushedOf = (r: Row) => r.s.answers.filter((a) => a.residual < Math.log(0.35)).length;
  // players by how many questions they rushed, split by quality band
  const RUSH_BUCKETS = ["0", "1", "2", "3", "4+"];
  const rushedPerPlayer = RUSH_BUCKETS.map((label, i) => {
    const xs = done.filter((r) => Math.min(4, rushedOf(r)) === i);
    return {
      rushed: label,
      green: xs.filter((r) => r.score!.band === "green").length,
      amber: xs.filter((r) => r.score!.band === "amber").length,
      red: xs.filter((r) => r.score!.band === "red").length,
    };
  });
  // does each player take longer on hard choices than on easy ones?
  const slowsDown = (r: Row): boolean | null => {
    const easy = r.s.answers.filter((a) => a.probe === "none" && a.closeness < 0.5).map((a) => a.latencyMs);
    const hard = r.s.answers.filter((a) => a.probe === "none" && a.closeness >= 0.5).map((a) => a.latencyMs);
    if (!easy.length || !hard.length) return null;
    return median(hard) > median(easy) * 1.1;
  };
  const slowDownByBand = (["green", "amber", "red"] as const).map((b) => {
    const xs = done
      .filter((r) => r.score!.band === b)
      .map(slowsDown)
      .filter((v): v is boolean => v != null);
    return {
      band: b,
      group: b === "green" ? "High quality players" : b === "amber" ? "Medium quality players" : "Low quality players",
      pct: xs.length ? Math.round((xs.filter(Boolean).length / xs.length) * 100) : 0,
      n: xs.length,
    };
  });
  const medianNeeded = median(answers.map((x) => x.a.expectedMs / 1000));
  const timingKeys = {
    medianNeededSeconds: round(medianNeeded, 1),
    rushLimitSeconds: round(medianNeeded * 0.35, 1),
    rushedShare: answers.length ? answers.filter((x) => ratioOf(x) < 0.35).length / answers.length : 0,
    medianSeconds: round(median(answers.map((x) => x.a.latencyMs / 1000)), 1),
    repeatRushers: done.filter((r) => rushedOf(r) >= 2).length,
    repeatRushersRed: done.filter((r) => rushedOf(r) >= 2 && r.score!.band === "red").length,
  };
  const closenessBins = ["0–0.25", "0.25–0.5", "0.5–0.75", "0.75–1"];
  const touchBins = ["<1s", "1–2s", "2–4s", "4–8s", "8s+"];
  const touchIdx = (ms: number) => (ms < 1000 ? 0 : ms < 2000 ? 1 : ms < 4000 ? 2 : ms < 8000 ? 3 : 4);
  const hesitation = closenessBins.map((cb, ci) => {
    const xs = answers.filter((x) => Math.min(3, Math.floor(x.a.closeness * 4)) === ci && x.a.firstTouchMs != null);
    const row: Record<string, string | number> = { closeness: cb };
    touchBins.forEach((tb, ti) => (row[tb] = xs.filter((x) => touchIdx(x.a.firstTouchMs!) === ti).length));
    return row;
  });
  const effortFit = closenessBins.map((cb, ci) => ({
    closeness: cb,
    medianSeconds: round(median(answers.filter((x) => x.r.score!.band === "green" && Math.min(3, Math.floor(x.a.closeness * 4)) === ci).map((x) => x.a.latencyMs / 1000)), 1),
    medianSecondsRed: round(median(answers.filter((x) => x.r.score!.band === "red" && Math.min(3, Math.floor(x.a.closeness * 4)) === ci).map((x) => x.a.latencyMs / 1000)), 1),
  }));

  // ---------- D. Patterns ----------
  const positionShare = (["triad", "duel"] as const).map((fmt) => {
    const xs = answers.filter((x) => getItem(x.a.itemId).format === fmt);
    const k = fmt === "triad" ? 3 : 2;
    const c = countBy(xs, (x) => String(x.a.position));
    return {
      format: fmt,
      expected: round(100 / k, 1),
      ...Object.fromEntries(Array.from({ length: k }, (_, i) => [`pos${i + 1}`, xs.length ? round(((c[String(i)] ?? 0) / xs.length) * 100, 1) : 0])),
    };
  });
  const posByRound = Array.from({ length: 10 }, (_, i) => {
    const xs = answers.filter((x) => x.a.round === i + 1);
    const c = countBy(xs, (x) => String(x.a.position));
    return { round: `R${i + 1}`, top: c["0"] ?? 0, middle: c["1"] ?? 0, bottom: c["2"] ?? 0 };
  });
  const entropyHist = histogram(
    done.map((r) => positionEntropy(r.s.answers.map((a) => a.position))),
    0,
    1,
    10,
    (v) => v.toFixed(1),
  );
  const lzHist = histogram(
    done.map((r) => lzComplexity(r.s.answers.map((a) => a.position))),
    0,
    2,
    10,
    (v) => v.toFixed(1),
  );
  // per player: how often did they tap their most-used screen spot? (under ~65% is normal over 4–10 questions)
  const favShare = (r: Row) => {
    const c = countBy(r.s.answers, (a) => String(a.position));
    return Math.max(...Object.values(c)) / r.s.answers.length;
  };
  const withAnswers = done.filter((r) => r.s.answers.length >= 4);
  const SPOT_BUCKETS = [
    { label: "Under 50%", lo: 0, hi: 0.5 },
    { label: "50–64%", lo: 0.5, hi: 0.65 },
    { label: "65–79%", lo: 0.65, hi: 0.8 },
    { label: "80% or more", lo: 0.8, hi: 1.01 },
  ];
  const favouriteSpot = SPOT_BUCKETS.map((b) => {
    const xs = withAnswers.filter((r) => favShare(r) >= b.lo && favShare(r) < b.hi);
    return {
      share: b.label,
      green: xs.filter((r) => r.score!.band === "green").length,
      amber: xs.filter((r) => r.score!.band === "amber").length,
      red: xs.filter((r) => r.score!.band === "red").length,
    };
  });
  const stuck = withAnswers.filter((r) => favShare(r) >= 0.8);
  const triadTaps = answers.filter((x) => getItem(x.a.itemId).format === "triad");
  const tc = countBy(triadTaps, (x) => String(x.a.position));
  const positionOverall = ["Top", "Middle", "Bottom"].map((p, i) => ({ position: p, share: triadTaps.length ? round(((tc[String(i)] ?? 0) / triadTaps.length) * 100, 1) : 0 }));
  const patternKeys = {
    stuckPlayers: stuck.length,
    stuckRed: stuck.filter((r) => r.score!.band === "red").length,
    rhythmPlayers: done.filter((r) => (r.score!.signals.find((x) => x.key === "rhythm")?.severity ?? 0) >= 0.5).length,
    changedMindShare: done.length ? done.filter((r) => r.s.answers.some((a) => a.changes > 0)).length / done.length : 0,
  };
  const changesByMoment = PROTEIN_STUDY.moments.map((m) => {
    const xs = answers.filter((x) => x.a.momentId === m.id);
    return {
      moment: m.emoji + " " + m.label.split(" ").slice(0, 2).join(" "),
      changes: round(mean(xs.map((x) => x.a.changes)), 2),
      focus: round(mean(xs.map((x) => x.a.focusCount)), 2),
    };
  });

  // ---------- E. Noise checks ----------
  const signalRate = (Object.keys(NOISE_WEIGHTS) as (keyof typeof NOISE_WEIGHTS)[]).map((k) => ({
    signal: NOISE_WEIGHTS[k].label,
    key: k,
    firing: done.filter((r) => (r.score!.signals.find((x) => x.key === k)?.severity ?? 0) >= 0.5).length,
    weak: NOISE_WEIGHTS[k].weak,
  }));
  const repeatRows = done.filter((r) => r.s.answers.some((a) => a.probe === "repeat"));
  const repeatAgree = repeatRows.filter((r) => {
    const rep = r.s.answers.find((a) => a.probe === "repeat")!;
    const orig = r.s.answers.find((a) => a.itemId === getItem(rep.itemId).repeatOf);
    return orig && orig.chosenIndex === rep.chosenIndex;
  }).length;
  const domRows = done.filter((r) => r.s.answers.some((a) => a.probe === "dominated"));
  const domFail = domRows.filter((r) => {
    const d = r.s.answers.find((a) => a.probe === "dominated")!;
    return d.chosenIndex === getItem(d.itemId).dominatedIndex;
  }).length;
  const surpriseHist = histogram(
    done.map((r) => (r.score!.signals.find((x) => x.key === "surprise")?.value as number) ?? NaN),
    0.6,
    2.6,
    10,
    (v) => v.toFixed(1),
  );
  // each warning sign: how many players showed it, split by the quality group they ended up in
  const signalByBand = (Object.keys(NOISE_WEIGHTS) as (keyof typeof NOISE_WEIGHTS)[])
    .map((k) => {
      const xs = done.filter((r) => (r.score!.signals.find((x) => x.key === k)?.severity ?? 0) >= 0.5);
      return {
        key: k,
        weak: NOISE_WEIGHTS[k].weak,
        points: NOISE_WEIGHTS[k].weight,
        green: xs.filter((r) => r.score!.band === "green").length,
        amber: xs.filter((r) => r.score!.band === "amber").length,
        red: xs.filter((r) => r.score!.band === "red").length,
        total: xs.length,
      };
    })
    .sort((a, b) => b.total - a.total);
  // hidden check questions: pass rate per quality group
  // passing the repeat = same answer, or only a close call changed (exactly how the quality score judges it)
  const passedRepeat = (r: Row) => {
    if (!r.s.answers.some((a) => a.probe === "repeat")) return null;
    return (r.score!.signals.find((x) => x.key === "repeat")?.severity ?? 0) < 0.5;
  };
  const passedTwin = (r: Row) => {
    const d = r.s.answers.find((a) => a.probe === "dominated");
    return d ? d.chosenIndex !== getItem(d.itemId).dominatedIndex : null;
  };
  const passRate = (rowsIn: Row[], f: (r: Row) => boolean | null) => {
    const v = rowsIn.map(f).filter((x): x is boolean => x != null);
    return v.length ? Math.round((v.filter(Boolean).length / v.length) * 100) : 0;
  };
  const byBand = (b: string) => done.filter((r) => r.score!.band === b);
  const probeByBand = [
    { check: "Overpriced twin", green: passRate(byBand("green"), passedTwin), amber: passRate(byBand("amber"), passedTwin), red: passRate(byBand("red"), passedTwin) },
    { check: "Repeat question", green: passRate(byBand("green"), passedRepeat), amber: passRate(byBand("amber"), passedRepeat), red: passRate(byBand("red"), passedRepeat) },
  ];
  const noise = {
    signalByBand,
    probeByBand,
    repeatPass: passRate(done, passedRepeat),
    signalRate,
    repeatAgreement: repeatRows.length ? repeatAgree / repeatRows.length : null,
    repeatN: repeatRows.length,
    dominatedFail: domRows.length ? domFail / domRows.length : null,
    dominatedN: domRows.length,
    surpriseHist,
    monotonicityHist: histogram(
      done.map((r) => (r.score!.signals.find((x) => x.key === "monotonicity")?.value as number) ?? 0),
      0,
      1,
      10,
      (v) => v.toFixed(1),
    ),
    cusumFired: done.filter((r) => r.s.answers.some((a) => a.selectReason === "cusum-probe")).length,
  };

  // ---------- F. Divergence (insights, usable sessions only) ----------
  const dv = usable.map((r) => r.score!.divergence);
  const contradictionTypes = Object.entries(countBy(usable, (r) => r.s.followup?.type ?? "none")).map(([type, count]) => ({ type, count }));
  const followupAnswers = Object.entries(
    countBy(
      usable.filter((r) => r.s.followup?.answer),
      (r) => `${r.s.followup!.type}::${r.s.followup!.answer}`,
    ),
  )
    .map(([k, count]) => {
      const [type, answer] = k.split("::");
      return { type, answer, count };
    })
    .sort((a, b) => b.count - a.count);
  const squeezeByDriver = ["price-led", "taste-led", "protein-led", "context-switcher", "undecided"].map((d) => {
    const xs = usable.filter((r) => r.s.posterior?.driver === d && r.score!.divergence.squeezeProteinCutShare != null);
    return { driver: d, proteinCutFirst: round(mean(xs.map((r) => r.score!.divergence.squeezeProteinCutShare!)) * 100, 0), n: xs.length };
  });
  const labelRows = usable.filter((r) => r.s.label);
  // protein interest measured from words to a real trade-off (same players, all on 0–100)
  const avgPct = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? { value: Math.round(mean(v) * 100), n: v.length } : { value: 0, n: 0 };
  };
  const ladder = [
    { step: "Said protein matters", where: "1–5 rating, asked last", ...avgPct(dv.map((d) => (d.stated != null ? (d.stated - 1) / 4 : null))) },
    { step: "Liked protein snacks on instinct", where: "Gut Check swipes", ...avgPct(dv.map((d) => d.gutProteinAppeal)) },
    { step: "Picked protein when it cost more", where: "Snack Moments choices", ...avgPct(dv.map((d) => d.proteinPickRate)) },
  ];
  // why people who said protein matters still skipped it (their own follow-up answers)
  const skipReasons = Object.entries(
    countBy(
      usable.filter((r) => r.s.followup?.type === "stated_vs_revealed" && r.s.followup.answer),
      (r) => r.s.followup!.answer!,
    ),
  )
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
  const sayDoGaps = dv.filter((d) => d.sayDoGap != null).map((d) => d.sayDoGap!);
  const divergence = {
    ladder,
    skipReasons,
    overstateShare: sayDoGaps.length ? sayDoGaps.filter((g) => g >= 1).length / sayDoGaps.length : 0,
    peekFirstShare: (() => {
      const xs = usable.filter((r) => r.s.peek?.reveals[0]);
      const c = countBy(xs, (r) => r.s.peek!.reveals[0].attr);
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      return top ? { attr: top[0], share: top[1] / xs.length, n: xs.length } : null;
    })(),
    sayDoHist: histogram(
      dv.filter((d) => d.sayDoGap != null).map((d) => d.sayDoGap!),
      -3,
      4,
      14,
      (v) => v.toFixed(1),
    ),
    sayDoMean: meanCI(dv.filter((d) => d.sayDoGap != null).map((d) => d.sayDoGap!)),
    statedVsRevealed: usable
      .filter((r) => r.s.stated != null)
      .map((r) => ({ stated: r.s.stated!, revealed: round(r.score!.divergence.revealedIndex, 2), driver: r.s.posterior?.driver ?? "?" })),
    selfVsCrowdHist: histogram(
      dv.filter((d) => d.selfVsCrowd != null).map((d) => d.selfVsCrowd!),
      -100,
      100,
      10,
      (v) => v.toFixed(0),
    ),
    choiceVsShelf: usable
      .filter((r) => r.score!.divergence.shelfProteinShare != null)
      .map((r) => ({ choice: round(r.score!.divergence.proteinPickRate * 100, 0), shelf: round(r.score!.divergence.shelfProteinShare! * 100, 0) })),
    gutVsChoice: usable
      .filter((r) => r.score!.divergence.gutProteinAppeal != null)
      .map((r) => ({ gut: round(r.score!.divergence.gutProteinAppeal! * 100, 0), choice: round(r.score!.divergence.proteinPickRate * 100, 0) })),
    squeezeByDriver,
    contradictionTypes,
    followupAnswers,
    peekFirst: ["price", "protein", "taste", "sugar"].map((a) => ({ attr: a, count: usable.filter((r) => r.s.peek?.reveals[0]?.attr === a).length })),
    proteinPeekedByStated: [
      {
        group: "Rated protein 4–5",
        rate: round(
          (usable.filter((r) => (r.s.stated ?? 0) >= 4 && r.s.peek?.reveals.some((x) => x.attr === "protein")).length /
            Math.max(1, usable.filter((r) => (r.s.stated ?? 0) >= 4 && r.s.peek).length)) *
            100,
          0,
        ),
      },
      {
        group: "Rated protein 1–3",
        rate: round(
          (usable.filter((r) => (r.s.stated ?? 5) <= 3 && r.s.peek?.reveals.some((x) => x.attr === "protein")).length /
            Math.max(1, usable.filter((r) => (r.s.stated ?? 5) <= 3 && r.s.peek).length)) *
            100,
          0,
        ),
      },
    ],
    bidVsModel: usable
      .filter((r) => r.s.bid && r.s.posterior)
      .flatMap((r) =>
        r.s.bid!.rounds.map((b) => {
          const ctx = getMoment(b.momentId).context;
          return { ctx, model: round(modelImpliedPrice(r.s.posterior!, ctx), 0), bid: b.bid };
        }),
      ),
    bidByContext: diffCI(
      usable.flatMap((r) => r.s.bid?.rounds.filter((b) => getMoment(b.momentId).context === "functional").map((b) => b.bid) ?? []),
      usable.flatMap((r) => r.s.bid?.rounds.filter((b) => getMoment(b.momentId).context === "craving").map((b) => b.bid) ?? []),
    ),
    labelRecall: {
      protein: labelRows.length ? labelRows.filter((r) => r.score!.divergence.labelProteinCorrect).length / labelRows.length : null,
      price: labelRows.length ? labelRows.filter((r) => r.score!.divergence.labelPriceCorrect).length / labelRows.length : null,
      n: labelRows.length,
    },
  };

  // ---------- G. Experiments ----------
  const rate = (r: Row) => r.score!.divergence.proteinPickRate;
  const framing = diffCI(usable.filter((r) => r.s.framing === "health").map(rate), usable.filter((r) => r.s.framing === "taste").map(rate));
  const wtpF = (r: Row) => r.s.posterior?.wtpFunctional.median ?? NaN;
  const anchoring = diffCI(
    usable
      .filter((r) => r.s.anchor === "high")
      .map(wtpF)
      .filter(Number.isFinite),
    usable
      .filter((r) => r.s.anchor === "low")
      .map(wtpF)
      .filter(Number.isFinite),
  );
  const formatRate = diffCI(
    usable.map((r) => r.score!.divergence.duelProteinRate).filter((x): x is number => x != null),
    usable.map((r) => r.score!.divergence.triadProteinRate).filter((x): x is number => x != null),
  );
  // Gift values are random, so gift size after Gut Check is a free randomised experiment on effort.
  const rushRate = (r: Row) => r.s.answers.filter((a) => a.residual < Math.log(0.35)).length / Math.max(1, r.s.answers.length);
  const giftAt = (r: Row, stage: string) => (r.s.rewards ?? []).find((x) => x.kind === "gift" && x.at === stage)?.points ?? null;
  const bigGift = done.filter((r) => (giftAt(r, "gut") ?? 0) >= 20);
  const smallGift = done.filter((r) => giftAt(r, "gut") === 10);
  const giftEffect = diffCI(bigGift.map(rushRate), smallGift.map(rushRate));
  const experiments = { framing, anchoring, formatRate, giftEffect };

  // ---------- H. Engagement & formats ----------
  // games scorecard. Completion uses everyone; speed and rushing use only high + medium quality players,
  // so a game isn't blamed for careless players (the quality score already handles them)
  const buildFormats = (R: Row[], A: typeof answers) => {
    const fmtStats = (fmt: "triad" | "duel") => {
      const xs = A.filter((x) => getItem(x.a.itemId).format === fmt && x.a.probe === "none");
      return {
        format: fmt === "triad" ? "Snack Moments (3-card)" : "Showdown (duel)",
        completion: null as number | null,
        medianSec: round(median(xs.map((x) => x.a.latencyMs / 1000)), 1),
        rushedPct: round((xs.filter((x) => x.a.residual < Math.log(0.35)).length / Math.max(1, xs.length)) * 100, 1),
        avgFit: round(mean(xs.map((x) => (x.a.fitProb ?? 0) * (fmt === "triad" ? 3 : 2))), 2),
        n: new Set(xs.map((x) => x.r.s.id)).size, // players, not answers
      };
    };
    const reachedStage = (k: string) => R.filter((r) => reached(r.s, k)).length;
    const finishedOfAssigned = (g: OptionalGame) => {
      const assigned = R.filter((r) => scoreOf(r.s, g)?.picked);
      return assigned.filter((r) => played(r.s, g)).length / Math.max(1, assigned.length);
    };
    return [
      {
        format: "Label Detective (memory)",
        completion: reachedStage("label") / Math.max(1, R.length),
        medianSec: round(median(R.flatMap((r) => r.s.label?.questions.map((q) => q.ms / 1000) ?? [])), 1),
        rushedPct: round(
          (R.flatMap((r) => r.s.label?.questions ?? []).filter((q) => q.ms < 1000).length / Math.max(1, R.flatMap((r) => r.s.label?.questions ?? []).length)) * 100,
          1,
        ),
        avgFit: null,
        n: R.filter((r) => r.s.label).length,
      },
      {
        format: "Gut Check (swipe)",
        completion: reachedStage("gut") / Math.max(1, reachedStage("label")),
        medianSec: round(median(R.flatMap((r) => r.s.gut?.swipes.map((x) => x.ms / 1000) ?? [])), 2),
        rushedPct: round((R.flatMap((r) => r.s.gut?.swipes ?? []).filter((x) => x.ms < 350).length / Math.max(1, R.flatMap((r) => r.s.gut?.swipes ?? []).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.gut).length,
      },
      { ...fmtStats("triad"), completion: reachedStage("rounds") / Math.max(1, reachedStage("gut")) },
      { ...fmtStats("duel"), completion: reachedStage("rounds") / Math.max(1, reachedStage("gut")) },
      {
        format: "Stock the Shelf (budget)",
        completion: finishedOfAssigned("shelf"),
        medianSec: round(median(R.flatMap((r) => (r.s.shelf ? [r.s.shelf.ms / 1000] : []))), 0),
        rushedPct: round((R.filter((r) => r.s.shelf && r.s.shelf.ms < 8000).length / Math.max(1, R.filter((r) => r.s.shelf).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.shelf).length,
      },
      {
        format: "Peek & Pick (process tracing)",
        completion: finishedOfAssigned("peek"),
        medianSec: round(median(R.flatMap((r) => (r.s.peek?.choice ? [r.s.peek.ms / 1000] : []))), 1),
        rushedPct: round((R.filter((r) => r.s.peek?.choice && r.s.peek.reveals.length === 0).length / Math.max(1, R.filter((r) => r.s.peek?.choice).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.peek?.choice).length,
      },
      {
        format: "Bid It (BDM auction)",
        completion: finishedOfAssigned("bid"),
        medianSec: round(median(R.flatMap((r) => r.s.bid?.rounds.map((b) => b.ms / 1000) ?? [])), 1),
        rushedPct: round((R.flatMap((r) => r.s.bid?.rounds ?? []).filter((b) => b.ms < 1500).length / Math.max(1, R.flatMap((r) => r.s.bid?.rounds ?? []).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.bid).length,
      },
      {
        format: "My Snack Week (frequency)",
        completion: finishedOfAssigned("week"),
        medianSec: round(median(R.flatMap((r) => (r.s.week ? [r.s.week.ms / 1000] : []))), 0),
        rushedPct: round((R.filter((r) => r.s.week && r.s.week.ms < 6000).length / Math.max(1, R.filter((r) => r.s.week).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.week).length,
      },
      {
        format: "Build-a-Bar (design + squeeze)",
        completion: finishedOfAssigned("bar"),
        medianSec: round(median(R.flatMap((r) => (r.s.bar ? [r.s.bar.ms / 1000] : []))), 0),
        rushedPct: round((R.filter((r) => r.s.bar && r.s.bar.ms < 8000).length / Math.max(1, R.filter((r) => r.s.bar).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.bar).length,
      },
      {
        format: "Guess the Crowd (projective)",
        completion: reachedStage("crowd") / Math.max(1, reachedStage("rounds")),
        medianSec: round(median(R.flatMap((r) => (r.s.crowd ? [r.s.crowd.ms / 1000] : []))), 1),
        rushedPct: round((R.filter((r) => r.s.crowd && r.s.crowd.ms < 1500).length / Math.max(1, R.filter((r) => r.s.crowd).length)) * 100, 1),
        avgFit: null,
        n: R.filter((r) => r.s.crowd).length,
      },
    ];
  };
  const formatsAll = buildFormats(rows, answers);
  const formatsCareful = buildFormats(
    rows.filter((r) => r.score?.band !== "red"),
    answers.filter((x) => x.r.score!.band !== "red"),
  );
  const formats = formatsAll.map((f, i) => ({ ...f, medianSec: formatsCareful[i].medianSec, rushedPct: formatsCareful[i].rushedPct }));
  const fatigue = Array.from({ length: 10 }, (_, i) => {
    const xs = answers.filter((x) => x.a.round === i + 1 && x.r.score!.band !== "red");
    return {
      round: i + 1,
      medianSec: round(median(xs.map((x) => x.a.latencyMs / 1000)), 1),
      avgFit: round(mean(xs.filter((x) => x.a.fitProb != null).map((x) => x.a.fitProb! * x.a.order.length)), 2),
      n: xs.length,
    };
  }).filter((x) => x.n > 0);
  // share of rushed answers at each question number (high + medium quality players; rising = players tiring)
  const rushByQuestion = Array.from({ length: 10 }, (_, i) => {
    const xs = answers.filter((x) => x.a.round === i + 1 && x.r.score!.band !== "red");
    return { question: String(i + 1), rushed: xs.length ? Math.round((xs.filter((x) => x.a.residual < Math.log(0.35)).length / xs.length) * 100) : 0, n: xs.length };
  }).filter((x) => x.n >= 10);
  const engagement = {
    rushByQuestion,
    formats,
    engagementHist: histogram(
      done.map((r) => r.score!.engagement),
      0,
      100,
      10,
      (v) => `${v}`,
    ),
    distractionRate: done.length ? done.filter((r) => r.s.counters.hidden > 0).length / done.length : 0,
    fatigue,
    exploratory: {
      tapCancelRate: round(mean(answers.map((x) => x.a.tapCancels)), 3),
      focusPerItem: round(mean(answers.map((x) => x.a.focusCount)), 2),
      changeRate: round(mean(answers.map((x) => (x.a.changes > 0 ? 1 : 0))), 3),
      hesitationVirtuous: round(
        median(
          answers
            .filter((x) => isTop(x.a))
            .map((x) => (x.a.firstTouchMs ?? NaN) / 1000)
            .filter(Number.isFinite),
        ),
        2,
      ),
      hesitationOther: round(
        median(
          answers
            .filter((x) => !isTop(x.a))
            .map((x) => (x.a.firstTouchMs ?? NaN) / 1000)
            .filter(Number.isFinite),
        ),
        2,
      ),
    },
  };

  // ---------- I. Rewards ----------
  const nudged = done.filter((r) => r.s.counters.nudges > 0);
  const afterNudge = nudged
    .map((r) => {
      const idx = r.s.answers.findIndex((a, i, arr) => i > 0 && a.residual < Math.log(0.35) && arr[i - 1].residual < Math.log(0.35));
      if (idx < 0) return null;
      const before = r.s.answers.slice(0, idx + 1).map((a) => a.residual);
      const after = r.s.answers.slice(idx + 1).map((a) => a.residual);
      return after.length ? { before: mean(before), after: mean(after) } : null;
    })
    .filter((x): x is { before: number; after: number } => !!x);
  // rushed answers before vs after the "take your time" message (share of answers)
  const nudgeRush = nudged
    .map((r) => {
      const idx = r.s.answers.findIndex((a, i, arr) => i > 0 && a.residual < Math.log(0.35) && arr[i - 1].residual < Math.log(0.35));
      if (idx < 0) return null;
      const share = (xs: typeof r.s.answers) => xs.filter((a) => a.residual < Math.log(0.35)).length / Math.max(1, xs.length);
      const after = r.s.answers.slice(idx + 1);
      return after.length ? { before: share(r.s.answers.slice(0, idx + 1)), after: share(after) } : null;
    })
    .filter((x): x is { before: number; after: number } => !!x);
  const bonusOf = (r: Row) => (r.s.rewards ?? []).filter((x) => ["gift", "skill", "bonus", "quality"].includes(x.kind)).reduce((a, x) => a + x.points, 0);
  const pointsByBand = (["green", "amber", "red"] as const).map((b) => ({
    band: b,
    group: BAND_NAME[b],
    avg: round(mean(done.filter((r) => r.score!.band === b).map((r) => r.s.points)), 0) ?? 0,
  }));
  const crowdAcc = done.filter((r) => r.s.crowd?.actualPct != null).map((r) => Math.abs(r.s.crowd!.guessPct - r.s.crowd!.actualPct!));
  const kinds = ["progress", "gift", "skill", "bonus", "quality"] as const;
  const rewards = {
    avgPoints: round(mean(done.map((r) => r.s.points)), 0),
    capShare: done.length ? done.filter((r) => bonusOf(r) >= 100).length / done.length : 0,
    pointsByBand,
    nudgeRush: nudgeRush.length
      ? { before: Math.round(mean(nudgeRush.map((x) => x.before)) * 100), after: Math.round(mean(nudgeRush.map((x) => x.after)) * 100), n: nudgeRush.length }
      : null,
    bonusSkipRate: rows.filter((r) => r.s.bonus).length ? rows.filter((r) => r.s.bonus?.skipped).length / rows.filter((r) => r.s.bonus).length : null,
    bonusSkipByBand: ["green", "amber", "red"].map((b) => {
      const xs = done.filter((r) => r.score!.band === b && r.s.bonus);
      return { band: b, skipRate: round((xs.filter((r) => r.s.bonus!.skipped).length / Math.max(1, xs.length)) * 100, 0) };
    }),
    pointsByKind: kinds.map((k) => ({ kind: k, avg: round(mean(done.map((r) => (r.s.rewards ?? []).filter((x) => x.kind === k).reduce((a, x) => a + x.points, 0))), 0) })),
    giftEffect,
    nudgedSessions: nudged.length,
    nudgeEffect: afterNudge.length
      ? { before: round(Math.exp(mean(afterNudge.map((x) => x.before))) * 100, 0), after: round(Math.exp(mean(afterNudge.map((x) => x.after))) * 100, 0), n: afterNudge.length }
      : null,
    crowdErrorHist: histogram(crowdAcc, 0, 100, 10, (v) => v.toFixed(0)),
    pointsVsQuality: done.map((r) => ({ points: r.s.points, quality: r.score!.quality, band: r.score!.band })),
  };

  // ---------- J. Fraud & cross-session ----------
  const allRows = sessions.map((r) => r.data);
  const byDevice = new Map<string, Set<string>>();
  for (const s of allRows) {
    const set = byDevice.get(s.deviceHash) ?? new Set();
    set.add(s.participantId);
    byDevice.set(s.deviceHash, set);
  }
  const sharedDevices = [...byDevice.entries()].filter(([, set]) => set.size > 1);
  const network = {
    nodes: [
      ...sharedDevices.map(([d, set]) => ({ id: d, type: "device", size: set.size })),
      ...sharedDevices.flatMap(([, set]) => [...set].map((p) => ({ id: p, type: "participant", size: 1 }))),
    ],
    links: sharedDevices.flatMap(([d, set]) => [...set].map((p) => ({ source: d, target: p }))),
  };
  const signature = (s: SessionData) => s.answers.map((a) => a.position).join("") + "|" + (s.gut?.swipes.map((x) => (x.right ? 1 : 0)).join("") ?? "");
  const sigGroups = Object.entries(countBy(done, (r) => signature(r.s)))
    .filter(([, c]) => c > 1)
    .map(([sig, count]) => ({ signature: sig, count, devices: new Set(done.filter((r) => signature(r.s) === sig).map((r) => r.s.deviceHash)).size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const feats = done.map((r) => [
    median(r.s.answers.map((a) => a.residual)),
    positionEntropy(r.s.answers.map((a) => a.position)),
    (r.score!.signals.find((x) => x.key === "surprise")?.value as number) ?? 1,
    Math.log(1 + median(r.s.gut?.swipes.map((x) => x.ms) ?? [800])),
    r.s.counters.hidden,
    r.s.answers.length,
  ]);
  const std = standardise(feats);
  const km = kmeans(std, 4);
  const proj = pca2(std);
  const centroidDist = std.map((p, i) => Math.sqrt(p.reduce((s, x, d) => s + (x - km.centroids[km.labels[i]][d]) ** 2, 0)));
  const outlierCut = quantile(centroidDist, 0.95);
  const clusters = done.map((r, i) => ({
    id: r.s.id,
    x: round(proj[i][0], 2),
    y: round(proj[i][1], 2),
    cluster: km.labels[i],
    band: r.score!.band,
    outlier: centroidDist[i] >= outlierCut,
  }));
  const clusterSummary = Array.from({ length: 4 }, (_, c) => {
    const m = done.filter((_, i) => km.labels[i] === c);
    return {
      cluster: c,
      size: m.length,
      redShare: round((m.filter((r) => r.score!.band === "red").length / Math.max(1, m.length)) * 100, 0),
      medianResidual: round(median(m.map((r) => median(r.s.answers.map((a) => a.residual)))), 2),
      sharedDevice: m.filter((r) => (byDevice.get(r.s.deviceHash)?.size ?? 0) > 1).length,
    };
  });
  const hourly = new Map<string, number>();
  for (const s of allRows) {
    const h = new Date(s.startedAt).toISOString().slice(5, 13).replace("T", " ") + "h";
    hourly.set(h, (hourly.get(h) ?? 0) + 1);
  }
  const hourVals = [...hourly.values()];
  const burstCut = Math.max(4, quantile(hourVals, 0.5) * 4);
  const trust = participants.map((p) => p.trustAlpha / (p.trustAlpha + p.trustBeta));
  const lowQ = (xs: Row[]) => xs.filter((r) => r.score?.band === "red").length;
  const deviceTable = sharedDevices
    .map(([d, set]) => {
      const xs = rows.filter((r) => r.s.deviceHash === d);
      return { device: d, players: set.size, sessions: xs.length, lowQuality: lowQ(xs) };
    })
    .sort((a, b) => b.players - a.players);
  const patternTable = sigGroups.map((g, i) => {
    const xs = done.filter((r) => signature(r.s) === g.signature);
    return { group: `Pattern ${String.fromCharCode(65 + i)}`, sessions: g.count, devices: g.devices, lowQuality: lowQ(xs) };
  });
  const fraud = {
    deviceTable,
    patternTable,
    sharedDevices: sharedDevices.map(([d, set]) => ({ device: d, participants: set.size })),
    network,
    sigGroups,
    clusters,
    clusterSummary,
    bursts: [...hourly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([hour, count]) => ({ hour, count, burst: count >= burstCut })),
    trustHist: histogram(trust, 0, 1, 10, (v) => v.toFixed(1)),
  };

  // ---------- L. Item health ----------
  const itemMap = new Map<string, { id: string; moment: string; format: string; shown: number; protein: number; rushed: number; eig: number[]; fit: number[] }>();
  for (const { a, r } of answers) {
    if (a.probe !== "none" || r.score!.band === "red") continue; // careless players don't count against a question
    const it = getItem(a.itemId);
    const e = itemMap.get(a.itemId) ?? { id: a.itemId, moment: getMoment(it.momentId).label, format: it.format, shown: 0, protein: 0, rushed: 0, eig: [], fit: [] };
    e.shown++;
    if (isTop(a)) e.protein++;
    if (a.residual < Math.log(0.35)) e.rushed++;
    if (a.eig != null) e.eig.push(a.eig);
    if (a.fitProb != null) e.fit.push(a.fitProb * a.order.length);
    itemMap.set(a.itemId, e);
  }
  const bankSize = PROTEIN_STUDY.items.length;
  const items = [...itemMap.values()]
    .map((e) => ({
      id: e.id,
      label: getItem(e.id)
        .options.map((o) => `${getSnack(o.snackId).emoji} ${getSnack(o.snackId).name} ₹${o.price}`)
        .join(" · "),
      moment: e.moment,
      format: e.format,
      shown: e.shown,
      proteinRate: round((e.protein / e.shown) * 100, 0),
      rushedPct: round((e.rushed / e.shown) * 100, 0),
      avgEig: round(mean(e.eig), 3),
      discrimination: round(mean(e.fit), 2),
      verdict:
        e.shown < 5
          ? "Too few answers yet"
          : mean(e.fit) < 1.1
            ? "Rewrite: answers look random"
            : e.rushed / e.shown > 0.3
              ? "Rewrite: often rushed"
              : "Useful",
    }))
    .sort((a, b) => b.shown - a.shown);
  const itemHealth = {
    bankSize,
    exposed: items.length,
    exposureShare: items.length / bankSize,
    // questions to rewrite first, then the most-asked ones
    items: [...items.filter((i) => i.verdict.startsWith("Rewrite")), ...items.filter((i) => !i.verdict.startsWith("Rewrite"))].slice(0, 40),
    rewriteCount: items.filter((i) => i.verdict.startsWith("Rewrite")).length,
    usefulCount: items.filter((i) => i.verdict === "Useful").length,
    weakest: items
      .filter((i) => i.shown >= 5)
      .sort((a, b) => (a.discrimination ?? 0) - (b.discrimination ?? 0))
      .slice(0, 5),
  };

  // ---------- N. Game rotation (+ the two newest games) ----------
  const rotation = buildRotation(rows, usable);

  // ---------- M. Evidence board ----------
  const usableDiv = usable.map((r) => r.score!.divergence);
  const ptAnswers = usable.filter((r) => r.s.followup?.type === "stated_vs_revealed" && r.s.followup.answer);
  const priceVsTaste = ptAnswers.filter((r) => /^Price|^Taste/.test(r.s.followup!.answer!)).map((r) => (r.s.followup!.answer!.startsWith("Price") ? 0.5 : -0.5));
  const evidence = buildEvidence({
    sayDo: divergence.sayDoMean,
    contextGap: meanCI(
      usableDiv.filter((d) => d.proteinRateFunctional != null && d.proteinRateCraving != null).map((d) => (d.proteinRateFunctional! - d.proteinRateCraving!) * 100),
    ),
    framing,
    labelGap: meanCI(
      usableDiv.filter((d) => d.labelPriceCorrect != null && d.labelProteinCorrect != null).map((d) => (d.labelPriceCorrect ? 1 : 0) - (d.labelProteinCorrect ? 1 : 0)),
    ),
    gutVsChoice: meanCI(usableDiv.filter((d) => d.gutVsChoice != null).map((d) => d.gutVsChoice!)),
    bidVsModel: meanCI(usableDiv.filter((d) => d.bidVsModelFunctional != null).map((d) => d.bidVsModelFunctional!)),
    anchoring,
    giftEffect,
    priceVsTaste: meanCI(priceVsTaste),
    designVsChoice: rotation.ipw.designVsChoice,
    weekFunctional: rotation.ipw.weekFunctional,
  });

  // ---------- Session table ----------
  const labelBy = new Map(labels.map((l) => [l.sessionId, l.label]));
  const table = rows
    .slice()
    .sort((a, b) => b.s.startedAt - a.s.startedAt)
    .slice(0, 400)
    .map((r) => {
      const quit = r.s.status === "completed" ? null : (FUNNEL.find((st) => !reached(r.s, st.key))?.label ?? null);
      return {
        id: r.s.id,
        started: r.s.startedAt,
        status: r.s.status,
        segment: r.s.segment,
        quality: r.score?.quality ?? null,
        band: r.score?.band ?? null,
        // warning signs that fired clearly, biggest first
        signs:
          r.score?.signals
            .filter((x) => x.severity >= 0.5)
            .sort((x, y) => y.weight * y.severity - x.weight * x.severity)
            .map((x) => x.key) ?? [],
        driver: r.s.posterior?.driver ?? null,
        minutes: r.s.completedAt ? round((r.s.completedAt - r.s.startedAt) / 60000, 1) : null,
        quitAt: quit,
        label: labelBy.get(r.s.id) ?? null,
      };
    });

  // ---------- Overview alerts: what needs a human right now ----------
  const steps = funnel;
  let worst = { from: "", to: "", lost: 0 };
  for (let i = 1; i < steps.length; i++) {
    const lost = steps[i - 1].count - steps[i].count;
    if (lost > worst.lost) worst = { from: steps[i - 1].step, to: steps[i].step, lost };
  }
  const burstHours = fraud.bursts.filter((b) => b.burst).length;
  const alerts = [
    overview.needsReview > 0 && {
      level: "high" as const,
      text: `${overview.needsReview} finished session${overview.needsReview === 1 ? "" : "s"} rated low quality and not yet checked by a person.`,
      tab: "K",
      action: "Review them",
    },
    fraud.sharedDevices.length > 0 && {
      level: "high" as const,
      text: `${fraud.sharedDevices.length} device${fraud.sharedDevices.length === 1 ? " is" : "s are"} being used by more than one player. This can mean one person playing many times.`,
      tab: "J",
      action: "See fraud checks",
    },
    fraud.sigGroups.length > 0 && {
      level: "medium" as const,
      text: `${fraud.sigGroups.reduce((a, g) => a + g.count, 0)} sessions share an identical answer pattern with another session (possible scripts or copying).`,
      tab: "J",
      action: "See fraud checks",
    },
    burstHours > 0 && {
      level: "medium" as const,
      text: `${burstHours} hour${burstHours === 1 ? "" : "s"} had an unusual burst of new sessions.`,
      tab: "J",
      action: "See fraud checks",
    },
    worst.lost > 0 && {
      level: "low" as const,
      text: `Most players who quit did so during "${worst.to}": ${worst.lost} players stopped there.`,
      tab: "B",
      action: "See funnel",
    },
  ].filter((a): a is { level: "high" | "medium" | "low"; text: string; tab: string; action: string } => !!a);

  return {
    alerts,
    filters: f,
    segments,
    overview,
    funnel: { steps: funnel, dropByRound, roundsHist, survival, stopReasons, roundsByReason, quitByQuestion },
    timing: { timingByMoment, expectedVsActual, residualHist, speedConsistency, hesitation, touchBins, effortFit, speedBands, rushedPerPlayer, slowDownByBand, keys: timingKeys },
    patterns: { positionShare, posByRound, entropyHist, lzHist, changesByMoment, favouriteSpot, positionOverall, keys: patternKeys },
    noise,
    divergence,
    experiments,
    engagement,
    rewards,
    fraud,
    itemHealth,
    evidence,
    rotation,
    table,
    labelsCount: labels.length,
    usableN: usable.length,
  };
}

// ---------------- rotation helpers ----------------
function scoreOf(s: SessionData, g: OptionalGame) {
  return [s.rotation?.pre, s.rotation?.post].flatMap((d) => d?.scores ?? []).find((x) => x.game === g) ?? null;
}

function played(s: SessionData, g: OptionalGame): boolean {
  if (g === "peek") return !!s.peek?.choice;
  if (g === "week") return !!s.week;
  if (g === "bid") return !!s.bid;
  if (g === "shelf") return !!s.shelf;
  return !!s.bar;
}

/**
 * Game rotation: did the judgment work, did coverage stay balanced, and what do the
 * propensity-weighted (unbiased) results say compared with naive averages?
 */
function buildRotation(rows: Row[], usable: Row[]) {
  const decided = rows.filter((r) => r.s.rotation?.pre || r.s.rotation?.post);
  const perGame = OPTIONAL_GAMES.map((g) => {
    const elig = decided.map((r) => ({ r, sc: scoreOf(r.s, g) })).filter((x) => x.sc);
    const assigned = elig.filter((x) => x.sc!.picked);
    const probs = elig.map((x) => x.sc!.prob);
    return {
      key: g,
      game: GAME_NAME[g],
      target: round(TARGET_SHARE[g] * 100, 0),
      assigned: round((assigned.length / Math.max(1, elig.length)) * 100, 0),
      finished: round((assigned.filter((x) => played(x.r.s, g)).length / Math.max(1, assigned.length)) * 100, 0),
      players: assigned.length,
      phase: PRE_GAMES.includes(g) ? ("pre" as const) : ("post" as const),
      avgProb: probs.length ? round(mean(probs), 2) : null,
      minProb: probs.length ? round(Math.min(...probs), 2) : null,
      eligible: elig.length,
    };
  });

  // judgment check: for each game, players for whom it was the best fit (highest value of the games on
  // offer, before the fair-share balance) vs everyone else offered it
  const bestFit = (r: Row, g: OptionalGame) => {
    const d = [r.s.rotation?.pre, r.s.rotation?.post].find((x) => x?.scores.some((sc) => sc.game === g));
    if (!d) return null;
    const mine = d.scores.find((sc) => sc.game === g)!;
    return d.scores.every((sc) => sc.game === g || sc.value < mine.value);
  };
  const share = (xs: Row[], g: OptionalGame) => (xs.length ? round((xs.filter((r) => scoreOf(r.s, g)?.picked).length / xs.length) * 100, 0) : null);
  const suits = OPTIONAL_GAMES.map((g) => {
    const elig = decided.filter((r) => bestFit(r, g) != null);
    const yes = elig.filter((r) => bestFit(r, g));
    const no = elig.filter((r) => !bestFit(r, g));
    return { key: g, game: GAME_NAME[g], suited: share(yes, g), other: share(no, g), nSuited: yes.length, nOther: no.length };
  });
  const drivers = ["price-led", "taste-led", "protein-led", "context-switcher", "undecided"];

  // naive vs inverse-propensity-weighted estimate, one headline number per game
  const estimate = (g: OptionalGame, y: (r: Row) => number | null) => {
    const xs = usable
      .map((r) => ({ y: y(r), sc: scoreOf(r.s, g) }))
      .filter((x): x is { y: number; sc: NonNullable<typeof x.sc> } => x.y != null && Number.isFinite(x.y) && !!x.sc?.picked);
    const naive = meanCI(xs.map((x) => x.y));
    const ipw = weightedMeanCI(
      xs.map((x) => x.y),
      xs.map((x) => 1 / Math.max(0.05, x.sc.prob)),
    );
    return { naive, ipw };
  };
  // sessions saved before the rotation existed played peek, bid and shelf with certainty
  const legacy = (r: Row, g: OptionalGame) => !r.s.rotation?.pre && !r.s.rotation?.post && played(r.s, g);
  const legacyCount = rows.filter((r) => OPTIONAL_GAMES.some((g) => legacy(r, g))).length;
  const div = (r: Row) => r.score?.divergence as (Divergence & Partial<Record<string, number | null>>) | undefined;
  const checks = [
    {
      game: "Peek & Pick",
      metric: "Looked at protein when it was hidden",
      unit: "%",
      ...estimate("peek", (r) => (r.s.peek ? (r.s.peek.reveals.some((x) => x.attr === "protein") ? 100 : 0) : null)),
    },
    { game: "My Snack Week", metric: "Snack moments a week", unit: "", ...estimate("week", (r) => div(r)?.weekSnacks ?? null) },
    { game: "Bid It", metric: "Bid for a protein bar after the gym", unit: "₹", ...estimate("bid", (r) => div(r)?.bidFunctional ?? null) },
    {
      game: "Stock the Shelf",
      metric: "Budget spent on protein snacks",
      unit: "%",
      ...estimate("shelf", (r) => (div(r)?.shelfProteinShare != null ? div(r)!.shelfProteinShare! * 100 : null)),
    },
    { game: "Build-a-Bar", metric: "Design points spent on protein", unit: "%", ...estimate("bar", (r) => (div(r)?.barProteinShare != null ? div(r)!.barProteinShare! * 100 : null)) },
  ].map((c) => ({ game: c.game, metric: c.metric, unit: c.unit, naive: c.naive, ipw: c.ipw, shift: Number.isFinite(c.ipw.estimate) ? c.ipw.estimate - c.naive.estimate : NaN }));

  // Build-a-Bar results
  const barRows = usable.filter((r) => r.s.bar);
  const barWeight = (r: Row) => 1 / Math.max(0.05, scoreOf(r.s, "bar")?.prob ?? 1);
  const wmean = (xs: Row[], f: (r: Row) => number, w: (r: Row) => number) => {
    const W = xs.reduce((a, r) => a + w(r), 0);
    return W ? xs.reduce((a, r) => a + f(r) * w(r), 0) / W : NaN;
  };
  const barIdeal = BAR_ATTRS.map((a) => {
    const designed = wmean(barRows, (r) => r.s.bar!.alloc[a.key] ?? 0, barWeight);
    const kept = wmean(barRows, (r) => r.s.bar!.final[a.key] ?? 0, barWeight);
    return { attr: a.label, designed: round(designed, 2), kept: round(kept, 2), keptPct: designed ? round((kept / designed) * 100, 0) : null };
  });
  const barByDriver = drivers
    .map((d) => {
      const xs = barRows.filter((r) => r.s.posterior?.driver === d);
      const row: Record<string, string | number> = { driver: d, n: xs.length };
      for (const a of BAR_ATTRS) row[a.label] = round(mean(xs.map((r) => r.s.bar!.alloc[a.key] ?? 0)), 1) ?? 0;
      return row;
    })
    .filter((r) => Number(r.n) > 0);
  const firstCut = BAR_ATTRS.map((a) => ({ attr: a.label, count: barRows.filter((r) => r.s.bar!.cutOrder[0] === a.key).length }));
  const designVsChoiceRows = barRows.filter((r) => div(r)?.designVsChoice != null);
  const designVsChoice = weightedMeanCI(
    designVsChoiceRows.map((r) => div(r)!.designVsChoice! * 100),
    designVsChoiceRows.map(barWeight),
  );

  // My Snack Week results
  const weekRows = usable.filter((r) => r.s.week);
  const weekWeight = (r: Row) => 1 / Math.max(0.05, scoreOf(r.s, "week")?.prob ?? 1);
  const weekByMoment = MOMENTS.map((m) => ({
    moment: m.label,
    context: m.context,
    perWeek: round(
      wmean(weekRows, (r) => r.s.week!.freq[m.id] ?? 0, weekWeight),
      2,
    ),
  }));
  const weekFunctionalRows = weekRows.filter((r) => div(r)?.weekFunctionalShare != null);
  const weekFunctional = weightedMeanCI(
    weekFunctionalRows.map((r) => (div(r)!.weekFunctionalShare! - 0.5) * 100),
    weekFunctionalRows.map(weekWeight),
  );
  const consistencyHist = histogram(
    rows.filter((r) => r.s.week?.consistency != null).map((r) => Math.min(3.49, r.s.week!.consistency!)),
    0,
    3.5,
    7,
    (v) => v.toFixed(1),
  );

  return {
    decided: decided.length,
    legacyCount,
    perGame,
    suits,
    checks,
    bar: { n: barRows.length, ideal: barIdeal, byDriver: barByDriver, firstCut, designVsChoice },
    week: { n: weekRows.length, byMoment: weekByMoment, functional: weekFunctional, consistencyHist },
    ipw: { designVsChoice, weekFunctional },
  };
}

export type AdminData = Awaited<ReturnType<typeof buildAdmin>>;
export type { CI };
