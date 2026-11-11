/**
 * CLI: generate labelled DEMO sessions through the real engine.
 * With the local embedded DB (PGlite), stop `npm run dev` first (single-process database),
 * or use the "Regenerate demo data" button in /admin instead.
 */
import { runSimulation } from "@/lib/simulate/run";

const n = Number(process.argv[2] ?? 300);
runSimulation({ studyId: "protein", n, reset: true }).then((r) => {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
});
