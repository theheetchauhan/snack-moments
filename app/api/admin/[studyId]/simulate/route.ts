import { NextResponse } from "next/server";
import { z } from "zod";
import { runSimulation } from "@/lib/simulate/run";

export const maxDuration = 300;

/** Generates labelled DEMO sessions (simulated = true) through the real engine. */
export async function POST(req: Request, { params }: { params: Promise<{ studyId: string }> }) {
  const { studyId } = await params;
  const body = z.object({ n: z.number().int().min(10).max(600).default(300), reset: z.boolean().default(true) }).parse(await req.json().catch(() => ({})));
  const t0 = Date.now();
  const r = await runSimulation({ studyId, n: body.n, reset: body.reset });
  return NextResponse.json({ ...r, ms: Date.now() - t0 });
}
