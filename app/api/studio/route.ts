import { z } from "zod";
import { nanoid } from "nanoid";
import { runStudio, type StudioEvent } from "@/lib/ai/studio";
import { getDb, schema } from "@/lib/db/client";

export const maxDuration = 300;

/**
 * Runs the Question Lab pipeline and streams each stage as one JSON line (NDJSON), so the page can
 * show progress live while the AI works. The finished run is saved.
 */
export async function POST(req: Request) {
  const body = z
    .object({ question: z.string().max(500).default(""), decision: z.string().max(400).default("") })
    .refine((b) => b.question.trim().length >= 8 || b.decision.trim().length >= 8, "Describe the decision (and optionally a question).")
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Describe the decision you need to make (at least a few words)." }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StudioEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const res = await runStudio(body.data.question, body.data.decision, send);
        const db = await getDb();
        await db
          .insert(schema.studioRuns)
          .values({ id: `run_${nanoid(10)}`, input: body.data, output: res, models: res.models ?? { mode: "rules" }, createdAt: Date.now() });
      } catch (err) {
        send({ stage: "error", data: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
