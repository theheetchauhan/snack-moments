import { simulateSession } from "./agents";
import { fullScores, populationShares } from "@/lib/session/engine";
import { appendEvents, clearSimulated, ensureParticipant, saveSession, scoreAndStore, setAiExplanation } from "@/lib/session/repo";
import { ruleExplanation } from "@/lib/ai/session";
import { addToCoverage, emptyCoverage } from "@/lib/adaptive/rotation";

/**
 * Generates DEMO sessions through the real engine and stores them like real ones.
 * Clearly flagged `simulated = true` everywhere; dashboards can filter them out.
 */
export async function runSimulation(opts: { studyId: string; n: number; reset: boolean; now?: number }) {
  const now = opts.now ?? Date.now();
  if (opts.reset) await clearSimulated(opts.studyId);
  // the rotation balances against everyone simulated so far, exactly like it does for live traffic
  const coverage = emptyCoverage();
  const sims = Array.from({ length: opts.n }, (_, i) => {
    const sim = simulateSession({ index: i, now, withEvents: true, coverage, realistic: true });
    addToCoverage(coverage, [sim.session.rotation.pre, sim.session.rotation.post]);
    return sim;
  });
  const population = populationShares(sims.map((x) => x.session.posterior).filter((p): p is NonNullable<typeof p> => !!p));
  const share = population.crowdShare;
  // a few sessions abandon midway, so funnels and drop-off charts have something to show
  let abandoned = 0;
  for (const { session: s, events } of sims) {
    await ensureParticipant(s.participantId, s.deviceHash, s.startedAt);
    // players who quit part-way are stored as abandoned, unscored (exactly like a real dropout)
    if (s.status !== "completed") {
      await saveSession(s);
      await appendEvents(
        s.id,
        events.map((e) => ({ ...e, ts: e.ts })),
        s.startedAt,
      );
      abandoned++;
      continue;
    }
    await appendEvents(
      s.id,
      events.map((e) => ({ ...e, ts: e.ts })),
      s.completedAt ?? now,
    );
    const sc = await scoreAndStore(s, { population });
    await setAiExplanation(s.id, ruleExplanation(sc.quality, sc.divergence, s));
  }
  const bands = sims.filter((x) => x.session.status === "completed").map((x) => fullScores(x.session).quality.band);
  return {
    created: sims.length,
    abandoned,
    crowdShare: share,
    bands: { green: bands.filter((b) => b === "green").length, amber: bands.filter((b) => b === "amber").length, red: bands.filter((b) => b === "red").length },
  };
}
