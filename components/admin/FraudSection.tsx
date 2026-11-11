"use client";
/**
 * Fraud tab: signs that fake or repeat players are getting in. One person playing many times on the
 * same phone, scripts that give identical answers, and sudden bursts of new players. Nothing here bans
 * anyone automatically; it points a person at the sessions worth checking.
 */
import type { AdminData } from "@/lib/admin/aggregate";
import { C, ExplainedChart, KeyNumber, LabeledBars } from "./charts";

export function FraudSection({ data }: { data: AdminData }) {
  const fr = data.fraud;
  const devicePlayers = fr.deviceTable.reduce((a, d) => a + d.players, 0);
  const patternSessions = fr.patternTable.reduce((a, g) => a + g.sessions, 0);
  const bursts = fr.bursts.filter((b) => b.burst);
  const hourly = fr.bursts.map((b) => ({ ...b, label: hourLabel(b.hour) }));
  const typical = (() => {
    const xs = fr.bursts.map((b) => b.count).sort((a, b) => a - b);
    return xs.length ? xs[Math.floor(xs.length / 2)] : 0;
  })();

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KeyNumber
          label="Phones used by more than one player"
          value={String(fr.deviceTable.length)}
          explain={`${devicePlayers} player accounts came from these phones. Can be family members sharing a phone, or one person playing again and again for points.`}
        />
        <KeyNumber
          label="Sessions with copy-paste answers"
          value={String(patternSessions)}
          explain="Sessions whose taps and swipes exactly match another session. Real people almost never match exactly, so this usually means a script or copying."
        />
        <KeyNumber
          label="Hours with a sudden rush of players"
          value={String(bursts.length)}
          explain={`Hours with far more new players than usual (a typical hour has about ${typical}). Often a link shared in a group to farm rewards.`}
        />
      </div>

      <ExplainedChart
        question="When did new players arrive?"
        howToRead="each bar is one hour, and its height is how many people started playing in that hour. Red bars are unusual rushes: far more new players than a normal hour."
        legend={[
          { color: C.s1, label: "Normal hour" },
          { color: C.bad, label: "Sudden rush" },
        ]}
        takeaway={
          bursts.length ? (
            <>
              {bursts.length} hour{bursts.length === 1 ? "" : "s"} had a sudden rush (up to {Math.max(...bursts.map((b) => b.count))} new players, against about {typical}{" "}
              normally). Check the tables below: rushes that come from shared phones or identical answers are almost always fake.
            </>
          ) : (
            "New players arrived steadily, with no sudden rushes."
          )
        }
      >
        <LabeledBars
          data={hourly}
          x="label"
          xLabel="Hour the players started"
          yLabel="New players"
          tooltipLabel={(x) => x}
          series={[{ key: "count", name: "New players", color: C.s1 }]}
          colorBy={(d) => (d.burst ? C.bad : C.s1)}
          height={240}
          xInterval="preserveStartEnd"
        />
      </ExplainedChart>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h3 className="font-display text-lg font-bold">Phones used by more than one player</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-ink">How to read it: </span>each row is one phone (shown by a short code, never personal details). The more players and the more low
            quality sessions on one phone, the more likely it is one person farming rewards.
          </p>
          <FraudTable
            head={["Phone", "Players", "Sessions", "Low quality"]}
            rows={fr.deviceTable.map((d) => [shortCode(d.device), d.players, d.sessions, d.lowQuality])}
            empty="No phone is shared between players."
          />
        </section>
        <section className="card p-5">
          <h3 className="font-display text-lg font-bold">Groups of sessions with identical answers</h3>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold text-ink">How to read it: </span>each row is one exact answer pattern (same taps, same swipes) shared by several sessions. If they also
            come from just one or two phones, it is almost certainly a script.
          </p>
          <FraudTable
            head={["Answer pattern", "Sessions", "Phones", "Low quality"]}
            rows={fr.patternTable.map((g) => [g.group, g.sessions, g.devices, g.lowQuality])}
            empty="No two sessions gave identical answers."
          />
        </section>
      </div>
    </div>
  );
}

function FraudTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <p className="mt-3 text-sm">✓ {empty}</p>;
  return (
    <table className="mt-3 w-full text-sm">
      <thead className="text-left text-xs text-muted">
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`py-1.5 ${i ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r[0])} className="border-t border-line">
            {r.map((v, i) => (
              <td key={i} className={`py-1.5 ${i ? "text-right tabular-nums" : "font-medium"} ${i === r.length - 1 && Number(v) > 0 ? "font-semibold text-bad" : ""}`}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "dev_ring_7f3a" → "Phone #7F3A": short, readable, and not personal data. */
function shortCode(device: string) {
  return `Phone #${device
    .replace(/[^a-z0-9]/gi, "")
    .slice(-4)
    .toUpperCase()}`;
}

/** "11-07 14h" hour keys → "7 Nov, 2pm". */
function hourLabel(hour: string) {
  const m = hour.match(/^(\d{2})-(\d{2}) (\d{2})h$/);
  if (!m) return hour;
  const month = new Date(Date.UTC(2000, Number(m[1]) - 1, 1)).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const h = Number(m[3]);
  return `${Number(m[2])} ${month}, ${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
}
