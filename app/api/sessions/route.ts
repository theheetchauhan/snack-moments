import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { startSession } from "@/lib/session/service";

const Body = z.object({ segment: z.string().max(40).default("unspecified"), deviceHash: z.string().max(64).default("unknown") });

export async function POST(req: Request) {
  const body = Body.parse(await req.json().catch(() => ({})));
  const cookiePid = req.headers.get("cookie")?.match(/sm_pid=([\w-]+)/)?.[1];
  const participantId = cookiePid ?? `p_${nanoid(10)}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const { session, screen, plan } = await startSession({ participantId, deviceHash: body.deviceHash, ip, segment: body.segment });
  const res = NextResponse.json({ sessionId: session.id, framing: session.framing, screen, plan });
  if (!cookiePid) res.cookies.set("sm_pid", participantId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}
