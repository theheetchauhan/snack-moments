import { NextResponse } from "next/server";
import { z } from "zod";
import { appendEvents, loadSession, saveSession } from "@/lib/session/repo";

const Body = z.object({
  sessionId: z.string().max(40),
  events: z
    .array(z.object({ type: z.string().max(40), round: z.number().int().nullable().optional(), payload: z.record(z.string(), z.unknown()).optional(), ts: z.number().optional() }))
    .max(200),
});

/** Batched behavioural events (sent every ~2s and on page hide via sendBeacon). */
export async function POST(req: Request) {
  const text = await req.text();
  const parsed = Body.safeParse(JSON.parse(text || "{}"));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { sessionId, events } = parsed.data;
  await appendEvents(sessionId, events);
  // keep cheap session counters server-side (distraction/idle) for engagement scoring
  const hidden = events.filter((e) => e.type === "visibility_hidden").length;
  const idle = events.filter((e) => e.type === "idle").length;
  if (hidden || idle) {
    const s = await loadSession(sessionId);
    if (s && s.status !== "completed") {
      s.counters.hidden += hidden;
      s.counters.idle += idle;
      s.counters.events += events.length;
      await saveSession(s);
    }
  }
  return NextResponse.json({ ok: true });
}
