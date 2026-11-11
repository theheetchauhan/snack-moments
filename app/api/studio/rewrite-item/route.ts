import { z } from "zod";
import { rewriteItem } from "@/lib/studio/rewriteItem";

/** Rewrites one weak live question using its real-player evidence (the Lab's learning loop). */
export async function POST(req: Request) {
  const body = z
    .object({ itemId: z.string(), verdict: z.string(), shown: z.number(), proteinRate: z.number().nullable(), rushedPct: z.number().nullable() })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    return Response.json(await rewriteItem(body.data));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
}
