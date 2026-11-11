import { simulateSession, TRUE_THETA, type Archetype } from "@/lib/simulate/agents";
for (const a of ["price_led","taste_led","protein_led","context_switcher"] as Archetype[]) {
  const acc = {a:0,bF:0,bC:0,c:0}; const imp = {price:0,protein:0,taste:0}; const n=10;
  for (let i=0;i<n;i++){ const p = simulateSession({index:i+900, now:1_780_000_000_000, archetype:a}).session.posterior!;
    for (const k of ["a","bF","bC","c"] as const) acc[k]+=p.mean[k]/n; for (const k of ["price","protein","taste"] as const) imp[k]+=p.importance[k]/n; }
  console.log(a.padEnd(17), "est", Object.entries(acc).map(([k,v])=>k+"="+v.toFixed(2)).join(" "), "| true", JSON.stringify((TRUE_THETA as Record<string, unknown>)[a]), "| imp", Object.entries(imp).map(([k,v])=>k+"="+v.toFixed(2)).join(" "));
}
