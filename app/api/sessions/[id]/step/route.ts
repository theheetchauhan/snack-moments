import { NextResponse } from "next/server";
import { z } from "zod";
import { step, type StepInput } from "@/lib/session/service";

const Answer = z.object({
  itemId: z.string().max(300),
  position: z.number().int().min(0).max(5),
  latencyMs: z.number().min(0).max(600_000),
  changes: z.number().int().min(0).max(50),
  focusCount: z.number().int().min(0).max(200),
  tapCancels: z.number().int().min(0).max(50),
  firstTouchMs: z.number().min(0).max(600_000).nullable(),
});
const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("label"),
    payload: z.object({ answers: z.array(z.object({ value: z.number(), ms: z.number().min(0) })).max(4), peekMs: z.number().min(0).max(120_000) }),
  }),
  z.object({
    kind: z.literal("gut"),
    payload: z.object({
      swipes: z.array(z.object({ snackId: z.string().max(40), right: z.boolean(), ms: z.number().min(0).max(120_000), reversals: z.number().int().min(0).max(50) })).max(12),
    }),
  }),
  z.object({ kind: z.literal("peek_reveal"), payload: z.object({ snackId: z.string().max(40), attr: z.enum(["price", "protein", "taste", "sugar"]) }) }),
  z.object({ kind: z.literal("peek"), payload: z.object({ choice: z.string().max(40), ms: z.number().min(0) }) }),
  z.object({
    kind: z.literal("bid"),
    payload: z.object({ bids: z.array(z.object({ momentId: z.string().max(40), bid: z.number().min(0).max(1000), ms: z.number().min(0), adjustments: z.number().int().min(0) })).max(4) }),
  }),
  z.object({
    kind: z.literal("bonus"),
    payload: z.object({ guesses: z.array(z.number().int().min(0).max(1).nullable()).max(4), skipped: z.boolean(), ms: z.number().min(0) }),
  }),
  z.object({ kind: z.literal("answer"), payload: Answer }),
  z.object({
    kind: z.literal("shelf"),
    payload: z.object({
      basket: z.record(z.string(), z.number().int().min(0).max(30)),
      removed: z.array(z.object({ snackId: z.string(), price: z.number(), order: z.number() })).max(60),
      finalBasket: z.record(z.string(), z.number().int().min(0).max(30)),
      ms: z.number().min(0),
    }),
  }),
  z.object({
    kind: z.literal("week"),
    payload: z.object({
      freq: z.record(z.string().max(40), z.number().min(0).max(20)),
      overall: z.number().min(0).max(40),
      changes: z.number().int().min(0).max(200),
      ms: z.number().min(0),
    }),
  }),
  z.object({
    kind: z.literal("bar"),
    payload: z.object({
      alloc: z.record(z.string().max(20), z.number().int().min(0).max(4)),
      final: z.record(z.string().max(20), z.number().int().min(0).max(4)),
      cutOrder: z.array(z.string().max(20)).max(20),
      moves: z.number().int().min(0).max(500),
      ms: z.number().min(0),
    }),
  }),
  z.object({
    kind: z.literal("crowd"),
    payload: z.object({
      guessPct: z.number().min(0).max(100),
      adjustments: z.number().int().min(0),
      ms: z.number().min(0),
      bonus: z.object({ guesses: z.array(z.number().int().min(0).max(1).nullable()).max(4), skipped: z.boolean(), ms: z.number().min(0) }).optional(),
    }),
  }),
  z.object({
    kind: z.literal("reality"),
    payload: z.object({ category: z.string().max(60), why: z.string().max(500), typingMs: z.number().min(0), pasted: z.boolean(), backspaces: z.number().int().min(0) }),
  }),
  z.object({ kind: z.literal("stated"), payload: z.object({ value: z.number().min(1).max(5) }) }),
  z.object({ kind: z.literal("followup"), payload: z.object({ answer: z.string().max(200) }) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  try {
    const r = await step(id, parsed.data as StepInput);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
