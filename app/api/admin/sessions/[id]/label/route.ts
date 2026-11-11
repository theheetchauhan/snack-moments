import { NextResponse } from "next/server";
import { z } from "zod";
import { addLabel } from "@/lib/session/repo";

/** Human review labels (approve / down-weight / exclude). Stored as training labels for a future learned model. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = z.object({ label: z.enum(["approve", "downweight", "exclude"]), note: z.string().max(300).optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await addLabel(id, body.data.label, body.data.note ?? null);
  return NextResponse.json({ ok: true });
}
