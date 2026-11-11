import Link from "next/link";
import { Luckiest_Guy } from "next/font/google";

// a chunky cartoon font for the game cards and section titles
const game = Luckiest_Guy({ weight: "400", subsets: ["latin"] });

const FLOATERS = [
  { e: "🍫", x: "6%", y: "18%", d: "0s", s: "2.6rem" },
  { e: "🥜", x: "88%", y: "14%", d: "1.2s", s: "2.2rem" },
  { e: "🍪", x: "12%", y: "72%", d: "0.6s", s: "2.4rem", desktopOnly: true },
  { e: "🥤", x: "84%", y: "68%", d: "1.8s", s: "2.6rem", desktopOnly: true },
  { e: "🍿", x: "70%", y: "84%", d: "2.4s", s: "1.8rem" },
  { e: "🥚", x: "26%", y: "88%", d: "3s", s: "1.7rem" },
];

const MODES = [
  { href: "/play", emoji: "🎮", title: "Play", line: "7 games · 3 minutes", tag: "PLAYER", color: "var(--accent)" },
  { href: "/admin/protein", emoji: "🧭", title: "Control Room", line: "Watch how people play", tag: "ADMIN", color: "var(--sky)" },
  { href: "/insights/protein", emoji: "📈", title: "Brand HQ", line: "What snacks win, and why", tag: "BRAND", color: "var(--leaf)" },
  { href: "/studio", emoji: "🧪", title: "Question Lab", line: "AI rebuilds a question", tag: "AI", color: "var(--berry)" },
];

const DECK = [
  { e: "🔎", n: "Label Detective", f: "Is protein even noticed?", d: "Glance at packs, then recall what you saw", t: "20s", c: "#3b6ea8" },
  { e: "⚡", n: "Gut Check", f: "Instinct vs careful choice", d: "Swipe yes or nah on instinct", t: "15s", c: "#f26b3a" },
  { e: "👀", n: "Peek & Pick", f: "What you check first", d: "Details hidden. 4 peeks, then pick", t: "25s", c: "#b8325a", bonus: true },
  { e: "📅", n: "My Snack Week", f: "When and how often you snack", d: "Map how often you snack, and when", t: "20s", c: "#2f7d5b", bonus: true },
  { e: "🍿", n: "Snack Moments", f: "What protein is worth to you, per moment", d: "Pick a snack for the moment. Adapts to you", t: "90s", c: "#f26b3a" },
  { e: "🔨", n: "Bid It", f: "Your real price for protein", d: "Bid what a protein bar is worth to you", t: "20s", c: "#d9a21b", bonus: true },
  { e: "🛒", n: "Stock the Shelf", f: "Must-haves when money's tight", d: "Fill a week's shelf, then budget cut!", t: "40s", c: "#3b6ea8", bonus: true },
  { e: "🧪", n: "Build-a-Bar", f: "What you wish for vs what you pick", d: "Invent your dream bar, then costs go up", t: "40s", c: "#7a3fb8", bonus: true },
  { e: "👥", n: "Guess the Crowd", f: "Honest answers vs looking good", d: "Guess what everyone else picked", t: "10s", c: "#2f7d5b" },
  { e: "⭐", n: "Bonus Round", f: "How well you read others", d: "Read the crowd for extra points", t: "10s", c: "#b8325a" },
];

export default function Home() {
  return (
    <main className="min-h-dvh overflow-x-hidden bg-[#22133a] text-white">
      {/* ---------- title screen ---------- */}
      <section className="relative isolate flex min-h-[88dvh] flex-col items-center justify-center overflow-hidden px-4 pb-16 pt-12 text-center">
        <div aria-hidden className="sm-sunburst absolute left-1/2 top-1/2 -z-10 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_45%,transparent_0,#22133a_70%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-b from-transparent to-[#22133a]" />
        {FLOATERS.map((f) => (
          <span key={f.e} aria-hidden className={`sm-float absolute -z-[5] select-none drop-shadow-[0_6px_0_rgba(0,0,0,0.25)] ${"desktopOnly" in f ? "hidden sm:block" : ""}`} style={{ left: f.x, top: f.y, animationDelay: f.d, fontSize: f.s }}>
            {f.e}
          </span>
        ))}

        <div className="sm-pop flex items-center gap-2 rounded-full border-2 border-white/20 bg-white/10 px-3 py-1 text-xs font-bold tracking-widest backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--butter)]" /> NEW SEASON · PROTEIN SNACKS
        </div>

        <h1 className="sm-logo mt-6 font-display font-extrabold uppercase leading-[0.85]">
          <span className="block text-[clamp(3.2rem,13vw,8rem)] text-[var(--butter)]">Snack</span>
          <span className="block text-[clamp(3.2rem,13vw,8rem)] text-white">Moments</span>
        </h1>

        <p className="mt-6 max-w-md text-lg font-semibold text-white/80">
          You say protein matters. <span className="text-[var(--butter)]">Can your choices prove it?</span>
        </p>

        <Link
          href="/play"
          className="sm-play mt-9 inline-flex items-center gap-3 rounded-2xl border-4 border-[#22133a] bg-[var(--accent)] px-10 py-4 font-display text-3xl font-extrabold uppercase tracking-wide text-white shadow-[0_8px_0_#8a2f12,0_14px_24px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-1 active:translate-y-1 active:shadow-[0_3px_0_#8a2f12]"
        >
          <span aria-hidden>▶</span> Play
        </Link>

        <ul className="mt-8 flex flex-wrap justify-center gap-2 text-sm font-bold">
          {[
            ["🎲", "10 games"],
            ["⏱️", "~4 min"],
            ["🏆", "Snack Pass levels"],
            ["🎁", "Mystery gift"],
          ].map(([e, t]) => (
            <li key={t} className="rounded-xl border-2 border-white/15 bg-white/5 px-3 py-1.5">
              <span aria-hidden>{e}</span> {t}
            </li>
          ))}
        </ul>

        <a href="#modes" aria-label="See all modes" className="absolute bottom-5 left-1/2 -translate-x-1/2 animate-bounce text-2xl text-white/50">
          ⌄
        </a>
      </section>

      {/* ---------- mode select ---------- */}
      <section id="modes" className="mx-auto max-w-5xl px-4 py-14">
        <h2 className={`${game.className} sm-title text-center text-3xl tracking-wide text-white`}>Select mode</h2>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {MODES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              style={{ background: `color-mix(in oklab, ${m.color} 22%, #fffaf2)` }}
              className="group relative flex flex-col items-center rounded-3xl border-4 border-[#120a20] p-5 text-center text-[#22133a] shadow-[0_8px_0_#120a20] transition-transform hover:-translate-y-1.5 active:translate-y-1 active:shadow-[0_3px_0_#120a20]"
            >
              <span
                className="absolute left-3 top-3 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-widest text-white"
                style={{ background: `color-mix(in oklab, ${m.color} 55%, #22133a)` }}
              >
                {m.tag}
              </span>
              <span
                aria-hidden
                className="mt-5 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#120a20] text-4xl shadow-[inset_0_-6px_0_rgba(0,0,0,0.25)] transition-transform group-hover:rotate-6 group-hover:scale-110"
                style={{ background: m.color }}
              >
                {m.emoji}
              </span>
              <span className="mt-4 font-display text-xl font-extrabold">{m.title}</span>
              <span className="mt-1 text-xs font-semibold text-[#22133a]/60">{m.line}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------- the deck ---------- */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className={`${game.className} sm-title text-3xl tracking-wide text-white`}>The deck</h2>
          <p className="text-xs font-bold text-white/60">
            <span className="rounded bg-[var(--butter)] px-1.5 py-0.5 text-[#22133a]">🎲 BONUS</span> cards are picked for you each run
          </p>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {DECK.map((c, i) => (
            <div
              key={c.n}
              className="sm-card relative flex flex-col overflow-hidden rounded-2xl border-4 border-[#120a20] text-[#22133a] shadow-[0_7px_0_#120a20]"
              style={{ ["--tilt" as string]: `${i % 2 ? 2 : -2}deg`, background: "#f4eee4" }}
            >
              {/* name banner */}
              <div className="flex min-h-[2.8rem] items-center gap-1.5 border-b-[3px] border-[#120a20] px-2 py-1.5" style={{ background: `color-mix(in oklab, ${c.c} 72%, #2c2140)` }}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-[#120a20] bg-white text-[10px] font-extrabold">{i + 1}</span>
                <span className={`${game.className} sm-cardname min-w-0 text-[14px] leading-[1.05] tracking-wide text-white sm:text-[15px]`}>{c.n}</span>
              </div>
              {/* art window */}
              <div
                className="sm-art relative mx-2 mt-2 flex aspect-[4/3] items-center justify-center rounded-xl border-[3px] border-[#120a20]"
                style={{ ["--card" as string]: c.c }}
              >
                <span aria-hidden className="text-5xl drop-shadow-[0_5px_0_rgba(0,0,0,0.25)] transition-transform duration-200">
                  {c.e}
                </span>
                <span
                  className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border-2 border-[#120a20] px-1.5 text-[9px] font-extrabold tracking-widest ${c.bonus ? "bg-[var(--butter)]" : "bg-white"}`}
                >
                  {c.bonus ? "🎲 BONUS" : "CORE"}
                </span>
              </div>
              {/* rules box */}
              <div className="mx-2 mb-2 mt-4 flex flex-1 flex-col justify-between rounded-lg border-2 border-[#120a20] bg-[#fff8ea] px-2 py-1.5">
                <p className="text-[11px] font-semibold leading-snug">{c.d}</p>
                <p className="mt-1.5 rounded-md px-1.5 py-1 text-[10px] font-bold leading-snug" style={{ background: `color-mix(in srgb, ${c.c} 9%, #fffaf2)` }}>
                  <span className="font-extrabold uppercase tracking-wider" style={{ color: `color-mix(in oklab, ${c.c} 60%, #22133a)` }}>
                    🎯 Finds:
                  </span>{" "}
                  {c.f}
                </p>
                <p className="mt-1 text-right text-[10px] font-extrabold text-[#22133a]/50">⏱ {c.t}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">Snack Moments · no right answers, only real ones 🍿</footer>
    </main>
  );
}
