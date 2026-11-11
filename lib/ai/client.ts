/**
 * LLM access via OpenRouter (multiple model families). Every call:
 *  - is optional: no key → caller uses the rule-based fallback, app still works
 *  - is schema-validated (Zod) structured output
 *  - is cached by input hash
 *  - only ever receives aggregated / anonymised data (no device, IP or participant ids)
 * Principle: LLMs propose hypotheses and explain; numbers always come from statistics.
 */
import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { hashString } from "@/lib/rng";

export type ModelRole = "writer" | "critic" | "fast";

export const MODELS: Record<ModelRole, string> = {
  writer: process.env.AI_MODEL_WRITER || "anthropic/claude-sonnet-5.5",
  critic: process.env.AI_MODEL_CRITIC || "google/gemini-3.8-flash",
  fast: process.env.AI_MODEL_FAST || "openai/gpt-5.4-mini",
};

export const aiEnabled = () => !!process.env.OPENROUTER_API_KEY;

let provider: ReturnType<typeof createOpenRouter> | null = null;
function model(role: ModelRole) {
  if (!provider) provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  return provider(MODELS[role]);
}

export async function aiObject<T>(opts: {
  role: ModelRole;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  cacheKey?: string;
}): Promise<{ value: T; model: string; cached: boolean } | null> {
  if (!aiEnabled()) return null;
  const key = `${opts.role}:${MODELS[opts.role]}:${hashString(opts.system + "\n" + opts.prompt)}:${opts.cacheKey ?? ""}`;
  try {
    const db = await getDb();
    const hit = await db.select().from(schema.aiCache).where(eq(schema.aiCache.key, key)).limit(1);
    if (hit[0]) return { value: hit[0].value as T, model: MODELS[opts.role], cached: true };
    const { output } = await generateText({
      model: model(opts.role),
      system: opts.system,
      prompt: opts.prompt,
      output: Output.object({ schema: opts.schema }),
      temperature: 0.3,
    });
    await db.insert(schema.aiCache).values({ key, value: output as object, createdAt: Date.now() }).onConflictDoNothing();
    return { value: output as T, model: MODELS[opts.role], cached: false };
  } catch (err) {
    console.error(`[ai:${opts.role}] failed, using fallback`, (err as Error).message);
    return null;
  }
}
