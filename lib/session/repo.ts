import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { SessionData } from "./types";
import { fullScores, populationShares, settleRewards } from "./engine";
import { addToCoverage, emptyCoverage, type Coverage } from "@/lib/adaptive/rotation";

export async function saveSession(s: SessionData) {
  const db = await getDb();
  const row = {
    id: s.id,
    studyId: s.studyId,
    participantId: s.participantId,
    deviceHash: s.deviceHash,
    ipHash: s.ipHash,
    framing: s.framing,
    anchor: s.anchor,
    segment: s.segment,
    status: s.status,
    stage: s.stage,
    startedAt: Math.round(s.startedAt),
    completedAt: s.completedAt == null ? null : Math.round(s.completedAt),
    simulated: s.simulated,
    archetype: s.archetype,
    data: s,
  };
  await db
    .insert(schema.sessions)
    .values(row)
    .onConflictDoUpdate({ target: schema.sessions.id, set: { ...row, id: undefined } as never });
}

export async function loadSession(id: string): Promise<SessionData | null> {
  const db = await getDb();
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).limit(1);
  const d = rows[0]?.data;
  // sessions saved by older engine versions may lack newer game fields
  return d ? normaliseSession(d) : null;
}

/** Sessions saved by older engine versions may lack newer game fields. */
export function normaliseSession(d: SessionData): SessionData {
  return Object.assign(
    { label: null, gut: null, peek: null, bid: null, bonus: null, week: null, bar: null, rotation: { pre: null, post: null }, rewards: [] } as Partial<SessionData>,
    d,
  ) as SessionData;
}

let coverageCache: { at: number; studyId: string; cov: Coverage } | null = null;

/**
 * How often each optional game has been offered so far (for rotation balancing).
 * Cached for 30s: balancing only needs to be roughly current, not exact to the second.
 */
export async function rotationCoverage(studyId: string): Promise<Coverage> {
  if (coverageCache && coverageCache.studyId === studyId && Date.now() - coverageCache.at < 30_000) return coverageCache.cov;
  const db = await getDb();
  const rows = await db.select({ data: schema.sessions.data }).from(schema.sessions).where(eq(schema.sessions.studyId, studyId));
  const cov = emptyCoverage();
  for (const r of rows) addToCoverage(cov, [r.data.rotation?.pre, r.data.rotation?.post]);
  coverageCache = { at: Date.now(), studyId, cov };
  return cov;
}

export async function ensureParticipant(id: string, deviceHash: string, now: number) {
  const db = await getDb();
  await db.insert(schema.participants).values({ id, deviceHash, createdAt: Math.round(now) }).onConflictDoNothing();
}

export interface EventIn {
  type: string;
  round?: number | null;
  payload?: Record<string, unknown>;
  ts?: number;
}

export async function appendEvents(sessionId: string, events: EventIn[], now = Date.now()) {
  if (!events.length) return;
  const db = await getDb();
  await db.insert(schema.eventLog).values(
    events.slice(0, 200).map((e) => ({
      sessionId,
      type: String(e.type).slice(0, 40),
      round: e.round ?? null,
      payload: e.payload ?? {},
      clientTs: e.ts == null ? null : Math.round(e.ts),
      serverTs: Math.round(now),
    })),
  );
}

export async function getEvents(sessionId: string) {
  const db = await getDb();
  return db.select().from(schema.eventLog).where(eq(schema.eventLog.sessionId, sessionId)).orderBy(schema.eventLog.id);
}

export async function completedPosteriors(studyId: string) {
  const db = await getDb();
  const rows = await db
    .select({ data: schema.sessions.data })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.studyId, studyId), eq(schema.sessions.status, "completed")));
  return rows.map((r) => r.data.posterior).filter((p): p is NonNullable<typeof p> => !!p);
}

/** Server-side, versioned scoring on completion (+ crowd accuracy bonus + trust update). */
export async function scoreAndStore(
  s: SessionData,
  opts: { textVerdict?: { lowEffort: number; reason: string } | null; aiExplanation?: string | null; population?: ReturnType<typeof populationShares> } = {},
) {
  const db = await getDb();
  const sc = fullScores(s, opts.textVerdict);
  // settle skill / bonus / quality rewards against the population model (never against preferences)
  const pop = opts.population ?? populationShares([...(await completedPosteriors(s.studyId)), ...(s.posterior ? [s.posterior] : [])]);
  settleRewards(s, pop, sc.quality.band);
  const row = {
    sessionId: s.id,
    quality: sc.quality.score,
    band: sc.quality.band,
    weight: sc.quality.weight,
    engagement: sc.engagement.score,
    signals: sc.quality.signals,
    divergence: sc.divergence,
    engagementParts: { ...sc.engagement.parts, fatigueSlope: sc.engagement.fatigueSlope },
    version: sc.quality.version,
    aiExplanation: opts.aiExplanation ?? null,
    computedAt: Date.now(),
  };
  await db
    .insert(schema.sessionScores)
    .values(row)
    .onConflictDoUpdate({ target: schema.sessionScores.sessionId, set: { ...row, sessionId: undefined } as never });
  // Trust: Beta(α, β) per participant, decays so old behaviour matters less.
  const p = await db.select().from(schema.participants).where(eq(schema.participants.id, s.participantId)).limit(1);
  if (p[0]) {
    const decay = 0.9;
    await db
      .update(schema.participants)
      .set({
        trustAlpha: p[0].trustAlpha * decay + sc.quality.weight,
        trustBeta: p[0].trustBeta * decay + (1 - sc.quality.weight),
        studies: p[0].studies + 1,
      })
      .where(eq(schema.participants.id, s.participantId));
  }
  await saveSession(s);
  return sc;
}

export async function setAiExplanation(sessionId: string, text: string) {
  const db = await getDb();
  await db.update(schema.sessionScores).set({ aiExplanation: text }).where(eq(schema.sessionScores.sessionId, sessionId));
}

export async function addLabel(sessionId: string, label: string, note: string | null) {
  const db = await getDb();
  await db.insert(schema.reviewLabels).values({ sessionId, label, note, createdAt: Date.now() });
}

export async function loadStudy(studyId: string) {
  const db = await getDb();
  const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.studyId, studyId));
  const ids = sessions.map((s) => s.id);
  const scores = ids.length ? await db.select().from(schema.sessionScores).where(inArray(schema.sessionScores.sessionId, ids)) : [];
  const labels = ids.length ? await db.select().from(schema.reviewLabels).where(inArray(schema.reviewLabels.sessionId, ids)) : [];
  const participants = await db.select().from(schema.participants);
  return { sessions, scores, labels, participants };
}

export async function clearSimulated(studyId: string) {
  const db = await getDb();
  const sim = await db
    .select({ id: schema.sessions.id, pid: schema.sessions.participantId })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.studyId, studyId), eq(schema.sessions.simulated, true)));
  const ids = sim.map((x) => x.id);
  if (!ids.length) return 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    await db.delete(schema.eventLog).where(inArray(schema.eventLog.sessionId, chunk));
    await db.delete(schema.sessionScores).where(inArray(schema.sessionScores.sessionId, chunk));
    await db.delete(schema.reviewLabels).where(inArray(schema.reviewLabels.sessionId, chunk));
    await db.delete(schema.sessions).where(inArray(schema.sessions.id, chunk));
  }
  const pids = [...new Set(sim.map((x) => x.pid))];
  for (let i = 0; i < pids.length; i += 200) await db.delete(schema.participants).where(inArray(schema.participants.id, pids.slice(i, i + 200)));
  return ids.length;
}
