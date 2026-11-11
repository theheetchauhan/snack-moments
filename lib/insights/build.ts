import { buildAdmin, type Filters } from "@/lib/admin/aggregate";
import { loadStudy, normaliseSession } from "@/lib/session/repo";
import { mean, median, round } from "@/lib/admin/stats";
import { getItem, getSnack, MOMENTS } from "@/lib/study/protein";
import { BAR_ATTRS } from "@/lib/study/bar";
import { EXPLANATIONS } from "@/lib/contradictions/detect";
import type { SessionData } from "@/lib/session/types";

/**
 * Brand HQ data. Only finished, usable sessions count (low quality players are left out), and each
 * player counts by their quality weight. Everything is worked out for "Everyone" and for each player
 * group, so the page can switch audience instantly.
 */

const DRIVERS = ["price-led", "taste-led", "protein-led", "context-switcher", "undecided"] as const;

type Row = { s: SessionData; w: number; revealed: number };

/** Chance this player was given a bonus game; results are re-weighted by 1 ÷ chance (see the Game rotation tab). */
const chance = (s: SessionData, game: string) => [s.rotation?.pre, s.rotation?.post].flatMap((d) => d?.scores ?? []).find((x) => x.game === game)?.prob ?? 1;

const wmean = (xs: { v: number; w: number }[]) => {
  const W = xs.reduce((a, x) => a + x.w, 0);
  return W ? xs.reduce((a, x) => a + x.v * x.w, 0) / W : NaN;
};

/** Did this answer pick the highest-protein card on screen? */
function proteinWon(itemId: string, chosen: number) {
  const it = getItem(itemId);
  const g = it.options.map((o) => getSnack(o.snackId).proteinG);
  return g[chosen] === Math.max(...g);
}

function audience(rows: Row[]) {
  const n = rows.length;
  const answers = rows.flatMap((r) => r.s.answers.filter((a) => a.probe === "none").map((a) => ({ a, w: r.w, driver: r.s.posterior!.driver })));

  // when do they snack, and when does protein win?
  const weekRows = rows.filter((r) => r.s.week);
  const moments = MOMENTS.map((m) => {
    const xs = answers.filter((x) => x.a.momentId === m.id);
    return {
      id: m.id,
      label: m.label,
      emoji: m.emoji,
      context: m.context,
      perWeek: weekRows.length ? round(wmean(weekRows.map((r) => ({ v: r.s.week!.freq[m.id] ?? 0, w: r.w / Math.max(0.05, chance(r.s, "week")) }))), 1) : null,
      proteinWins: xs.length >= 5 ? round(wmean(xs.map((x) => ({ v: proteinWon(x.a.itemId, x.a.chosenIndex) ? 100 : 0, w: x.w }))), 0) : null,
      answers: xs.length,
    };
  });
  const winsIn = (ctx: string) => {
    const xs = answers.filter((x) => MOMENTS.find((m) => m.id === x.a.momentId)?.context === ctx);
    return xs.length ? round(wmean(xs.map((x) => ({ v: proteinWon(x.a.itemId, x.a.chosenIndex) ? 100 : 0, w: x.w }))), 0) : null;
  };

  // what is 1g of protein worth?
  const wtpWork = round(median(rows.map((r) => r.s.posterior!.wtpFunctional.median)), 2);
  const wtpFun = round(median(rows.map((r) => r.s.posterior!.wtpCraving.median)), 2);

  // who are they?
  const personas = DRIVERS.map((d) => {
    const xs = rows.filter((r) => r.s.posterior!.driver === d);
    const ans = answers.filter((x) => x.driver === d);
    const best = MOMENTS.map((m) => {
      const ys = ans.filter((x) => x.a.momentId === m.id);
      return { m, rate: ys.length >= 3 ? mean(ys.map((x) => (proteinWon(x.a.itemId, x.a.chosenIndex) ? 1 : 0))) : -1 };
    }).sort((a, b) => b.rate - a.rate)[0];
    return {
      driver: d,
      share: n ? round((xs.reduce((a, r) => a + r.w, 0) / rows.reduce((a, r) => a + r.w, 0)) * 100, 0) : 0,
      players: xs.length,
      wtpWork: xs.length ? round(median(xs.map((r) => r.s.posterior!.wtpFunctional.median)), 1) : null,
      wtpFun: xs.length ? round(median(xs.map((r) => r.s.posterior!.wtpCraving.median)), 1) : null,
      proteinWins: ans.length ? round(mean(ans.map((x) => (proteinWon(x.a.itemId, x.a.chosenIndex) ? 100 : 0))), 0) : null,
      bestMoment: best && best.rate >= 0 ? `${best.m.emoji} ${best.m.label}` : null,
    };
  });

  // what they say vs what they do
  const stated = rows.filter((r) => r.s.stated != null);
  const sayDo = { said: round(mean(stated.map((r) => r.s.stated!)), 1) ?? NaN, did: round(mean(stated.map((r) => r.revealed)), 1) ?? NaN, players: stated.length };

  // why do people who say protein matters skip it? (their own follow-up answers)
  const skipRows = rows.filter((r) => r.s.followup?.type === "stated_vs_revealed" && r.s.followup.answer);
  const skipReasons = EXPLANATIONS.stated_vs_revealed.map((full) => ({
    reason: full.split(" — ")[0].replace(/ \(.*\)$/, ""),
    full,
    count: skipRows.filter((r) => r.s.followup!.answer === full).length,
  }));

  // their ideal bar (Build-a-Bar), re-weighted so it stands for everyone
  const barRows = rows.filter((r) => r.s.bar);
  const bw = (r: Row) => r.w / Math.max(0.05, chance(r.s, "bar"));
  const idealBar = {
    players: barRows.length,
    attrs: BAR_ATTRS.map((a) => {
      const asked = wmean(barRows.map((r) => ({ v: r.s.bar!.alloc[a.key] ?? 0, w: bw(r) })));
      const kept = wmean(barRows.map((r) => ({ v: r.s.bar!.final[a.key] ?? 0, w: bw(r) })));
      return { attr: a.label, emoji: a.emoji, asked: round(asked, 1), kept: round(kept, 1), keptPct: asked ? round((kept / asked) * 100, 0) : null };
    }),
  };

  // on the shelf: what they notice, and what they check first
  const label = rows.filter((r) => r.s.label);
  const recalled = (kind: string) => {
    const xs = label.map((r) => r.s.label!.questions.find((q) => q.kind === kind)).filter((q) => q != null);
    return xs.length ? round((xs.filter((q) => q!.answer === q!.correct).length / xs.length) * 100, 0) : null;
  };
  const peekRows = rows.filter((r) => r.s.peek?.reveals.length);
  const pw = (r: Row) => r.w / Math.max(0.05, chance(r.s, "peek"));
  const peekTotal = peekRows.reduce((a, r) => a + pw(r), 0);
  const firstLook = ["price", "protein", "taste", "sugar"].map((attr) => ({
    attr,
    pct: peekTotal ? (round((peekRows.filter((r) => r.s.peek!.reveals[0].attr === attr).reduce((a, r) => a + pw(r), 0) / peekTotal) * 100, 0) ?? 0) : 0,
  }));

  return {
    n,
    moments,
    proteinWinsWork: winsIn("functional"),
    proteinWinsFun: winsIn("craving"),
    wtpWork,
    wtpFun,
    personas,
    sayDo,
    skipReasons,
    idealBar,
    shelf: { proteinRecall: recalled("protein"), priceRecall: recalled("price"), labelPlayers: label.length, firstLook, peekPlayers: peekRows.length },
  };
}

export async function buildInsights(studyId: string, source: Filters["source"]) {
  const admin = await buildAdmin(studyId, { source, segment: "all", framing: "all" });
  const { sessions, scores } = await loadStudy(studyId);
  const scoreBy = new Map(scores.map((s) => [s.sessionId, s]));
  const rows: Row[] = sessions
    .map((r) => ({ s: normaliseSession(r.data as SessionData), sc: scoreBy.get(r.id) }))
    .filter((r) => r.s.status === "completed" && r.sc && r.sc.weight > 0 && r.s.posterior)
    .filter((r) => (source === "all" ? true : source === "simulated" ? r.s.simulated : !r.s.simulated))
    .map((r) => ({ s: r.s, w: r.sc!.weight, revealed: (r.sc!.divergence as { revealedIndex: number }).revealedIndex }));

  const segments = [...new Set(rows.map((r) => r.s.segment))].sort();
  const audiences: Record<string, ReturnType<typeof audience>> = { Everyone: audience(rows) };
  for (const seg of segments) audiences[seg] = audience(rows.filter((r) => r.s.segment === seg));

  // what-if simulator: 10 likely versions of each player's preferences, weighted by answer quality
  const population = rows.map((r) => ({ w: r.w, segment: r.s.segment, draws: r.s.posterior!.draws.slice(0, 10) }));

  return {
    n: rows.length,
    segments,
    audiences,
    population,
    evidence: admin.evidence,
    // aggregated statistics handed to the AI recommendations (never raw sessions)
    keyStats: {
      sayDo: admin.divergence.sayDoMean,
      framing: admin.experiments.framing,
      labelRecall: admin.divergence.labelRecall,
      bidByContext: admin.divergence.bidByContext,
      peekFirst: admin.divergence.peekFirst,
      followups: admin.divergence.followupAnswers.slice(0, 6),
    },
  };
}

export type InsightsData = Awaited<ReturnType<typeof buildInsights>>;
export type AudienceData = InsightsData["audiences"][string];
