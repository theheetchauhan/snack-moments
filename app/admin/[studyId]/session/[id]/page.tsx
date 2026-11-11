import Link from "next/link";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/lib/db/client";
import { getEvents, loadSession } from "@/lib/session/repo";
import { fullScores } from "@/lib/session/engine";
import { getItem, getMoment, getSnack } from "@/lib/study/protein";
import { SessionActions } from "@/components/admin/SessionActions";
import { AGAINST, GAME_NAME } from "@/lib/adaptive/rotation";
import { BAR_ATTRS } from "@/lib/study/bar";
import { RUSH_RESIDUAL } from "@/lib/timing/expected";
import { DRIVER, SIGN, when } from "@/lib/scoring/plain";

/**
 * One session, explained for a reviewer: can we trust it (and why that score), what the player
 * told us, their choices round by round, the other games, and why they got their bonus games.
 */
export const dynamic = "force-dynamic";

const BAND = {
  green: { color: "#0ca30c", name: "High quality", counts: "Counts fully in the results." },
  amber: { color: "#fab219", name: "Medium quality", counts: "" },
  red: { color: "#d03b3b", name: "Low quality", counts: "Left out of the results." },
} as const;

/** Signs whose stored detail is already plain enough to show as evidence. */
const PLAIN_DETAIL = new Set(["speed", "position", "monotonicity", "text"]);
const ATTR: Record<string, string> = { price: "price", protein: "protein", taste: "taste", sugar: "sugar" };

export default async function SessionPage({ params }: { params: Promise<{ studyId: string; id: string }> }) {
  const { studyId, id } = await params;
  const s = await loadSession(id);
  if (!s) notFound();
  const db = await getDb();
  const labels = await db.select().from(schema.reviewLabels).where(eq(schema.reviewLabels.sessionId, id));
  const events = await getEvents(id);
  const sc = fullScores(s);
  const q = sc.quality;
  const band = BAND[q.band];
  const t0 = events[0]?.clientTs ?? s.startedAt;
  const finished = s.status === "completed";

  const signs = q.signals.map((x) => ({ ...x, penalty: x.weak && q.strongSignals === 0 ? 0 : Math.round(x.weight * x.severity) }));
  const lost = signs.filter((x) => x.penalty > 0).sort((a, b) => b.penalty - a.penalty);
  const ignored = signs.filter((x) => x.penalty === 0 && x.severity >= 0.5);
  const passed = signs.filter((x) => x.penalty === 0 && x.severity < 0.5);
  const counts = q.band === "amber" ? `Counts at ${Math.round(q.weight * 100)}% strength in the results.` : band.counts;

  const driver = s.posterior ? DRIVER[s.posterior.driver] : null;
  const revealed = sc.divergence.revealedIndex;
  const fmtWtp = (x: number) => (x <= 0.05 ? "₹0" : `₹${x.toFixed(1)}`);
  const minutes = s.completedAt ? ((s.completedAt - s.startedAt) / 60000).toFixed(1) : null;

  return (
    <div className="theme-admin min-h-dvh bg-bg">
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link href={`/admin/${studyId}?tab=K`} className="text-sm text-muted underline">
          ← Back to Player Surveys
        </Link>
        <div className="mt-3">
          <h1 className="font-display text-2xl font-bold">
            {s.segment} · {when(s.startedAt)}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {finished ? `Finished in ${minutes} min` : "Didn't finish"} · {s.answers.length} Snack Moments questions · {s.points} points ·{" "}
            <span className="font-mono text-xs">{s.id}</span>
          </p>
        </div>

        {!finished && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-bold">This player didn&apos;t finish</h2>
            <p className="mt-1 text-sm text-muted">
              They stopped at <span className="font-semibold text-ink">{quitAt(s)}</span>. Unfinished sessions are never scored or counted in the results, so there is nothing to
              review.{s.label ? " What they did before stopping is below." : ""}
            </p>
          </section>
        )}

        {/* 1. can we trust it? */}
        {finished && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-bold">Can we trust this session?</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full px-3 py-1 text-sm font-bold text-white" style={{ background: band.color }}>
                {band.name} · {q.score}/100
              </span>
              <span className="text-sm text-muted">{counts}</span>
            </div>
            <SessionActions sessionId={s.id} labels={labels.map((l) => ({ label: l.label, at: l.createdAt }))} />
          </section>
        )}

        {/* 2. why this score */}
        {finished && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-bold">Why this score?</h2>
            <p className="mt-1 text-sm text-muted">Every player starts at 100. Each warning sign takes points off; the bigger the sign, the more it takes.</p>
            {lost.length ? (
              <div className="mt-3 grid gap-3">
                {lost.map((p) => (
                  <div key={p.key} className="grid grid-cols-[1fr_auto] items-start gap-x-3">
                    <div>
                      <p className="text-sm font-semibold">{SIGN[p.key]?.name ?? p.label}</p>
                      <p className="text-sm text-muted">
                        {SIGN[p.key]?.meaning}
                        {PLAIN_DETAIL.has(p.key) && p.detail ? <span className="block text-xs">Evidence: {p.detail}</span> : null}
                      </p>
                    </div>
                    <span className="font-display text-lg font-bold tabular-nums text-bad">−{p.penalty}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm">✓ No warning signs: this player answered carefully throughout.</p>
            )}
            {ignored.length > 0 && (
              <p className="mt-3 text-sm text-muted">
                <span className="font-semibold text-ink">Noticed but not counted: </span>
                {ignored.map((x) => SIGN[x.key]?.name ?? x.label).join(", ")}. A weak sign only counts when a stronger one shows up too.
              </p>
            )}
            {passed.length > 0 && (
              <p className="mt-2 text-sm text-muted">
                <span className="font-semibold text-ink">Checks passed: </span>
                {passed.map((x) => SIGN[x.key]?.name ?? x.label).join(" · ")}
              </p>
            )}
          </section>
        )}

        {/* 3. what the player told us */}
        {(s.posterior || s.stated != null || s.reality) && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-bold">What this player told us</h2>
            <p className="mt-1 text-sm text-muted">
              Findings about the player, never counted against them.
              {q.band === "red" && " This session is low quality, so take these with a pinch of salt: they are left out of the results."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {driver && (
                <Fact title="Snack personality">
                  <span className="font-semibold">
                    {driver.emoji} {driver.title}
                  </span>
                  <span className="block text-muted">{driver.line}</span>
                </Fact>
              )}
              {s.posterior && (
                <Fact title="What 1g of protein is worth to them">
                  At the desk or gym: <b>{fmtWtp(s.posterior.wtpFunctional.median)}</b> · late night or fun: <b>{fmtWtp(s.posterior.wtpCraving.median)}</b>
                  <span className="block text-muted">Worked out from the trade-offs they made between price and protein.</span>
                </Fact>
              )}
              {s.stated != null && (
                <Fact title="Said vs did">
                  Rated protein <b>{s.stated}/5</b>; their choices point to <b>{revealed.toFixed(1)}/5</b>.
                  <span className="block text-muted">
                    {Math.abs(s.stated - revealed) < 1
                      ? "Their words match their choices."
                      : s.stated > revealed
                        ? "They say protein matters more than their choices show."
                        : "Their choices show protein matters more than they say."}
                  </span>
                </Fact>
              )}
              {s.followup && s.followup.type !== "none" && (
                <Fact title="Follow-up question">
                  &ldquo;{s.followup.question}&rdquo;
                  <span className="block font-semibold">→ {s.followup.answer ?? "No answer"}</span>
                </Fact>
              )}
              {s.reality && (
                <Fact title="Last snack they really bought">
                  {s.reality.category}
                  {s.reality.why ? (
                    <span className="block text-muted">
                      &ldquo;{s.reality.why}&rdquo;{s.reality.pasted ? " (pasted)" : ""}
                    </span>
                  ) : null}
                </Fact>
              )}
            </div>
          </section>
        )}

        {/* 4. choices round by round */}
        {s.answers.length > 0 && (
          <section className="card mt-4 min-w-0 p-5">
            <h2 className="font-display text-lg font-bold">Their Snack Moments choices</h2>
            <p className="mt-1 text-sm text-muted">
              One row per question. The dark card is the one they picked. &ldquo;Rushed&rdquo; means faster than anyone could read the cards.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2">Moment</th>
                    <th>Cards (price · protein)</th>
                    <th className="text-right">Time taken</th>
                  </tr>
                </thead>
                <tbody>
                  {s.answers.map((a) => {
                    const it = getItem(a.itemId);
                    const m = getMoment(a.momentId);
                    const rushed = a.residual < RUSH_RESIDUAL;
                    return (
                      <tr key={a.round} className="border-t border-line align-top">
                        <td className="py-2 pr-3">
                          {m.emoji} {m.label}
                          {a.probe !== "none" && (
                            <span className="block text-xs text-muted">{a.probe === "repeat" ? "Check: a repeated question" : "Check: one card is an overpriced twin"}</span>
                          )}
                        </td>
                        <td className="pr-3">
                          {a.order.map((canon, pos) => {
                            const o = it.options[canon];
                            const sn = getSnack(o.snackId);
                            return (
                              <span
                                key={pos}
                                title={sn.name}
                                className={`mb-1 mr-1 inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${canon === a.chosenIndex ? "bg-ink text-white" : "bg-line"}`}
                              >
                                {sn.emoji} ₹{o.price} · {sn.proteinG}g
                              </span>
                            );
                          })}
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {(a.latencyMs / 1000).toFixed(1)}s{rushed && <span className="ml-1 rounded bg-bad/10 px-1 text-xs font-semibold text-bad">Rushed</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* 5. other games */}
        {(s.label || s.gut || s.peek?.choice || s.week || s.bid || s.shelf || s.bar || s.crowd) && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-bold">The other games</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
              {s.label && <Row name="Label Detective">{s.label.questions.map((x) => `Remembered the ${x.kind}: ${x.answer === x.correct ? "✓" : "✕"}`).join(" · ")}</Row>}
              {s.gut && (
                <Row name="Gut Check">
                  Liked {s.gut.swipes.filter((x) => x.right).length} of {s.gut.swipes.length} snacks · typical swipe {(median(s.gut.swipes.map((x) => x.ms)) / 1000).toFixed(1)}s
                </Row>
              )}
              {s.peek?.choice && (
                <Row name="Peek & Pick">
                  Looked at {s.peek.reveals.length ? [...new Set(s.peek.reveals.map((r) => ATTR[r.attr]))].join(", then ") : "nothing"} → picked {getSnack(s.peek.choice).name}
                </Row>
              )}
              {s.week && (
                <Row name="My Snack Week">
                  About {s.week.overall} snack moments a week ·{" "}
                  {Object.entries(s.week.freq)
                    .filter(([, v]) => v)
                    .map(([m, v]) => `${getMoment(m).emoji} ${v}`)
                    .join("  ")}
                </Row>
              )}
              {s.bid && (
                <Row name="Bid It">
                  {s.bid.rounds.map((b) => `${getMoment(b.momentId).emoji} bid ₹${b.bid} (shop price ₹${b.randomPrice}${b.won ? ", bought it" : ""})`).join(" · ")}
                </Row>
              )}
              {s.shelf && (
                <Row name="Stock the Shelf">
                  Bought{" "}
                  {Object.entries(s.shelf.basket)
                    .filter(([, n]) => n)
                    .map(([k, n]) => `${n} × ${getSnack(k).name}`)
                    .join(", ")}
                  . When the budget dropped, cut {groupNames(s.shelf.removed.map((r) => getSnack(r.snackId).name)) || "nothing"}.
                </Row>
              )}
              {s.bar && (
                <Row name="Build-a-Bar">
                  Designed <b>{s.bar.name}</b>: {BAR_ATTRS.map((a) => `${a.label.toLowerCase()} ${s.bar!.alloc[a.key]}`).join(", ")} (points out of 4). Cut first when costs rose:{" "}
                  {BAR_ATTRS.find((a) => a.key === s.bar!.cutOrder[0])?.label.toLowerCase() ?? "nothing"}.
                </Row>
              )}
              {s.crowd && (
                <Row name="Guess the Crowd">
                  Guessed {s.crowd.guessPct}% of players would pick the {getSnack(s.crowd.targetSnackId).name}
                  {s.crowd.actualPct != null ? ` (really ${s.crowd.actualPct}%)` : ""}
                </Row>
              )}
            </dl>
          </section>
        )}

        {/* 6. why these bonus games */}
        {(s.rotation?.pre || s.rotation?.post) && (
          <section className="card mt-4 p-5">
            <h2 className="font-display text-lg font-bold">Why they got these bonus games</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[s.rotation.pre, s.rotation.post].map((d) => {
                if (!d) return null;
                const got = d.scores.find((x) => x.picked)!;
                const why = got.reasons.filter((r) => !r.startsWith("Base value") && !r.startsWith(AGAINST)).map((r) => r.split(":")[0]);
                return (
                  <div key={d.phase} className="rounded-xl bg-bg p-3 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{d.phase === "pre" ? "Before Snack Moments" : "After Snack Moments"}</p>
                    <p className="mt-1">
                      Got <b>{GAME_NAME[got.game]}</b> ({Math.round(got.prob * 100)}% chance)
                    </p>
                    <p className="text-muted">{why.length ? `Because: ${why.join("; ")}.` : "No special reason: picked to keep every game fairly shared."}</p>
                    <p className="mt-1 text-xs text-muted">
                      Other options:{" "}
                      {d.scores
                        .filter((x) => !x.picked)
                        .map((x) => `${GAME_NAME[x.game]} (${Math.round(x.prob * 100)}%)`)
                        .join(", ")}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 7. raw log, tucked away */}
        <details className="card mt-4 p-5">
          <summary className="cursor-pointer text-sm font-semibold">Raw event log ({events.length} events, for developers)</summary>
          <ol className="mt-2 max-h-[420px] overflow-auto font-mono text-[11px]">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2 border-t border-line py-0.5">
                <span className="w-14 shrink-0 text-right text-muted">+{(((e.clientTs ?? e.serverTs) - t0) / 1000).toFixed(1)}s</span>
                <span className="w-28 shrink-0">{e.type}</span>
                <span className="truncate text-muted">{JSON.stringify(e.payload)}</span>
              </li>
            ))}
          </ol>
        </details>
      </main>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-bg p-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold">{name}</dt>
      <dd className="mb-1 text-muted sm:mb-0">{children}</dd>
    </>
  );
}

function median(xs: number[]) {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
}

/** ["Bar", "Bar", "Chips"] → "2 × Bar, 1 × Chips" */
function groupNames(names: string[]) {
  const c = new Map<string, number>();
  for (const n of names) c.set(n, (c.get(n) ?? 0) + 1);
  return [...c].map(([n, k]) => `${k} × ${n}`).join(", ");
}

/** The first core step this player never completed. */
function quitAt(s: { label: unknown; gut: unknown; posterior: unknown; crowd: unknown; reality: unknown; stated: number | null }) {
  if (!s.label) return "Label Detective (the first game)";
  if (!s.gut) return "Gut Check";
  if (!s.posterior) return "Snack Moments";
  if (!s.crowd) return "Guess the Crowd";
  if (!s.reality) return "the reality check";
  if (s.stated == null) return "the 1–5 rating";
  return "the follow-up question";
}
