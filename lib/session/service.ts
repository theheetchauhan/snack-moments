import { nanoid } from "nanoid";
import { hashString } from "@/lib/rng";
import {
  createSession,
  liveQuality,
  nextScreen,
  submitAnswer,
  submitCrowd,
  submitFollowup,
  submitReality,
  submitShelf,
  submitStated,
  submitLabel,
  submitGut,
  submitPeek,
  revealPeek,
  submitBid,
  submitBonus,
  submitWeek,
  submitBar,
  sessionPlan,
  fullScores,
  type AnswerInput,
} from "./engine";
import { appendEvents, ensureParticipant, loadSession, rotationCoverage, saveSession, scoreAndStore, setAiExplanation } from "./repo";
import { aiExplanation, ruleExplanation, textVerdict } from "@/lib/ai/session";
import type { SessionData } from "./types";

export const hashIp = (ip: string) => `ip_${hashString(`${process.env.IP_SALT ?? "snack"}:${ip}`).toString(36)}`;

export async function startSession(opts: { participantId: string; deviceHash: string; ip: string; segment: string }) {
  const now = Date.now();
  await ensureParticipant(opts.participantId, opts.deviceHash, now);
  const s = createSession({
    id: `s_${nanoid(12)}`,
    participantId: opts.participantId,
    deviceHash: opts.deviceHash.slice(0, 64),
    ipHash: hashIp(opts.ip),
    segment: opts.segment.slice(0, 40),
    now,
  });
  const screen = nextScreen(s, now);
  await saveSession(s);
  await appendEvents(s.id, [{ type: "session_start", payload: { framing: s.framing, anchor: s.anchor, segment: s.segment } }]);
  return { session: s, screen, plan: sessionPlan(s) };
}

export type StepInput =
  | { kind: "label"; payload: Parameters<typeof submitLabel>[1] }
  | { kind: "gut"; payload: Parameters<typeof submitGut>[1] }
  | { kind: "peek_reveal"; payload: Parameters<typeof revealPeek>[1] }
  | { kind: "peek"; payload: Parameters<typeof submitPeek>[1] }
  | { kind: "bid"; payload: Parameters<typeof submitBid>[1] }
  | { kind: "bonus"; payload: Parameters<typeof submitBonus>[1] }
  | { kind: "answer"; payload: AnswerInput }
  | { kind: "shelf"; payload: Parameters<typeof submitShelf>[1] }
  | { kind: "week"; payload: Parameters<typeof submitWeek>[1] }
  | { kind: "bar"; payload: Parameters<typeof submitBar>[1] }
  | { kind: "crowd"; payload: Parameters<typeof submitCrowd>[1] }
  | { kind: "reality"; payload: Parameters<typeof submitReality>[1] }
  | { kind: "stated"; payload: { value: number } }
  | { kind: "followup"; payload: { answer: string } };

export async function step(id: string, input: StepInput) {
  const s = await loadSession(id);
  if (!s) throw new Error("session not found");
  if (s.status === "completed") return { screen: { kind: "done" as const }, results: buildResults(s) };
  const now = Date.now();
  let nudge = false;
  let reveal: { value: string; left: number } | null = null;
  const rewardsBefore = (s.rewards ?? []).length;
  switch (input.kind) {
    case "peek_reveal":
      reveal = revealPeek(s, input.payload, now);
      break;
    case "peek":
      submitPeek(s, input.payload);
      break;
    case "bid":
      submitBid(s, input.payload);
      break;
    case "bonus":
      submitBonus(s, input.payload);
      break;
    case "label":
      submitLabel(s, input.payload);
      break;
    case "gut":
      submitGut(s, input.payload);
      break;
    case "answer":
      nudge = submitAnswer(s, input.payload).nudge;
      break;
    case "shelf":
      submitShelf(s, input.payload);
      break;
    case "week":
      submitWeek(s, input.payload);
      break;
    case "bar":
      submitBar(s, input.payload);
      break;
    case "crowd":
      submitCrowd(s, input.payload);
      break;
    case "reality":
      submitReality(s, input.payload);
      break;
    case "stated":
      submitStated(s, input.payload.value);
      break;
    case "followup":
      submitFollowup(s, input.payload.answer, now);
      break;
  }
  const hadPre = !!s.rotation?.pre;
  const hadPost = !!s.rotation?.post;
  const screen = nextScreen(s, now, { coverage: await rotationCoverage(s.studyId) });
  // log each rotation decision the moment it is made, with its propensities
  const decided = [!hadPre ? s.rotation?.pre : null, !hadPost ? s.rotation?.post : null].filter((d): d is NonNullable<typeof d> => !!d);
  if (decided.length)
    await appendEvents(
      s.id,
      decided.map((d) => ({ type: "rotation_decided", payload: { phase: d.phase, picked: d.picked, probs: Object.fromEntries(d.scores.map((x) => [x.game, x.prob])) } })),
    );
  let results = null;
  // status is mutated by the submit* calls above, so re-read it without TS narrowing
  if ((s.status as SessionData["status"]) === "completed") {
    results = await finishSession(s);
  } else {
    await saveSession(s);
  }
  const newRewards = (s.rewards ?? []).slice(rewardsBefore).filter((r) => r.at !== "settle");
  return { screen, plan: sessionPlan(s), nudge, live: liveQuality(s), results, reveal, rewards: { total: s.points, added: newRewards } };
}

async function finishSession(s: SessionData) {
  const verdict = await textVerdict(s);
  const sc = await scoreAndStore(s, { textVerdict: verdict });
  const explanation = (await aiExplanation(sc.quality, sc.divergence, s)) ?? ruleExplanation(sc.quality, sc.divergence, s);
  await setAiExplanation(s.id, explanation);
  return buildResults(s);
}

export function buildResults(s: SessionData) {
  const sc = fullScores(s);
  return {
    posterior: s.posterior
      ? {
          wtpFunctional: s.posterior.wtpFunctional,
          wtpCraving: s.posterior.wtpCraving,
          driver: s.posterior.driver,
          importance: s.posterior.importance,
          pContextSwitch: s.posterior.pContextSwitch,
        }
      : null,
    divergence: sc.divergence,
    stated: s.stated,
    rounds: s.answers.length,
    points: s.points,
    rewards: s.rewards ?? [],
    bid: s.bid,
    peek: s.peek,
    week: s.week,
    bar: s.bar,
    rotation: s.rotation
      ? [s.rotation.pre, s.rotation.post].flatMap((d) => d?.picked ?? [])
      : [],
    bonus: s.bonus,
    crowd: s.crowd,
    followup: s.followup,
    quality: { score: sc.quality.score, band: sc.quality.band, signals: sc.quality.signals.filter((x) => x.severity > 0) },
  };
}

export async function getSessionScreen(id: string) {
  const s = await loadSession(id);
  if (!s) return null;
  if (s.status === "completed") return { screen: { kind: "done" as const }, plan: sessionPlan(s), results: buildResults(s), live: liveQuality(s) };
  const screen = nextScreen(s, Date.now(), { coverage: await rotationCoverage(s.studyId) });
  await saveSession(s);
  return { screen, plan: sessionPlan(s), live: liveQuality(s), results: null };
}
