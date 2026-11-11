"use client";
/**
 * Chart primitives for the admin + insights dashboards (Recharts).
 * Colour by job: categorical slots in fixed order, a single blue ramp for magnitude,
 * status colours only for quality bands (always with a text label).
 */
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
} from "recharts";

export const C = {
  s1: "#2a78d6", // blue
  s2: "#eb6834", // orange
  s3: "#1baf7a", // aqua
  good: "#0ca30c",
  warn: "#fab219",
  bad: "#d03b3b",
  grid: "#e8e7e3",
  axis: "#898781",
  ink2: "#52514e",
  seq: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
};
export const BAND_COLOR: Record<string, string> = { green: C.good, amber: C.warn, red: C.bad };
/** One naming for the three quality bands, used on every tab. */
export const BAND_LABEL: Record<string, string> = { green: "High quality players", amber: "Medium quality players", red: "Low quality players" };
/** Legend for the bands, with what happens to each one's answers. */
export const QUALITY_LEGEND = [
  { color: "#0ca30c", label: "High quality players", note: "played carefully; their answers make sense (score 70–100)" },
  { color: "#fab219", label: "Medium quality players", note: "a few warning signs, like rushing some questions (score 40–69)" },
  { color: "#d03b3b", label: "Low quality players", note: "2+ clear signs of careless or fake play (score 0–39)" },
];

const axis = { stroke: C.axis, fontSize: 11, tickLine: false, axisLine: { stroke: C.grid } } as const;
const tip = { contentStyle: { borderRadius: 10, border: `1px solid ${C.grid}`, fontSize: 12 }, cursor: { fill: "rgba(0,0,0,0.04)" } } as const;

export function ChartCard({ title, sub, children, className = "" }: { title: string; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Bars({
  data,
  x,
  y,
  color = C.s1,
  height = 200,
  horizontal = false,
  unit = "",
  colorBy,
  refY,
}: {
  data: Record<string, unknown>[];
  x: string;
  y: string;
  color?: string;
  height?: number;
  horizontal?: boolean;
  unit?: string;
  colorBy?: (d: Record<string, unknown>) => string;
  refY?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 8 : -12, right: 8, top: 4, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={C.grid} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" {...axis} unit={unit} />
            <YAxis type="category" dataKey={x} {...axis} width={150} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} />
            <YAxis {...axis} unit={unit} />
          </>
        )}
        <Tooltip {...tip} />
        {refY != null && <ReferenceLine y={refY} stroke={C.ink2} strokeDasharray="4 4" />}
        <Bar isAnimationActive={false} dataKey={y} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36}>
          {colorBy && data.map((d, i) => <Cell key={i} fill={colorBy(d)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MultiBars({ data, x, series, height = 220, unit = "", stacked = false }: { data: Record<string, unknown>[]; x: string; series: { key: string; name: string; color: string }[]; height?: number; unit?: string; stacked?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -12, right: 8, top: 4 }} barGap={2}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} unit={unit} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]) : [4, 4, 0, 0]} maxBarSize={28} stroke="#fff" strokeWidth={stacked ? 1 : 0} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, x, series, height = 220, unit = "", yDomain }: { data: Record<string, unknown>[]; x: string; series: { key: string; name: string; color: string }[]; height?: number; unit?: string; yDomain?: [number | string, number | string] }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} unit={unit} domain={yDomain ?? ["auto", "auto"]} />
        <Tooltip {...tip} cursor={{ stroke: C.axis }} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {series.map((s) => (
          <Line isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} type="monotone" />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Dots({
  groups,
  x,
  y,
  xLabel,
  yLabel,
  height = 260,
  diagonal = false,
  refX,
  refY,
}: {
  groups: { name: string; color: string; data: Record<string, unknown>[] }[];
  x: string;
  y: string;
  xLabel: string;
  yLabel: string;
  height?: number;
  diagonal?: boolean;
  refX?: number;
  refY?: number;
}) {
  const all = groups.flatMap((g) => g.data);
  const max = Math.max(1, ...all.map((d) => Math.max(Number(d[x]) || 0, Number(d[y]) || 0)));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ left: -8, right: 12, top: 4, bottom: 14 }}>
        <CartesianGrid stroke={C.grid} />
        <XAxis type="number" dataKey={x} name={xLabel} {...axis} label={{ value: xLabel, position: "insideBottom", offset: -8, fontSize: 11, fill: C.axis }} />
        <YAxis type="number" dataKey={y} name={yLabel} {...axis} label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 18, fontSize: 11, fill: C.axis }} />
        <ZAxis range={[36, 36]} />
        <Tooltip {...tip} cursor={{ strokeDasharray: "3 3" }} />
        {groups.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {diagonal && <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={C.ink2} strokeDasharray="4 4" />}
        {refX != null && <ReferenceLine x={refX} stroke={C.ink2} strokeDasharray="4 4" />}
        {refY != null && <ReferenceLine y={refY} stroke={C.ink2} strokeDasharray="4 4" />}
        {groups.map((g) => (
          <Scatter isAnimationActive={false} key={g.name} name={g.name} data={g.data} fill={g.color} fillOpacity={0.7} stroke="#fff" strokeWidth={1} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Effect with 95% CI as a dot + error bar against a zero line. */
export function EffectChart({ rows, unit = "" }: { rows: { name: string; estimate: number; lo: number; hi: number }[]; unit?: string }) {
  const data = rows.map((r) => ({ ...r, err: [r.estimate - r.lo, r.hi - r.estimate] }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 56)}>
      <ScatterChart layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" dataKey="estimate" {...axis} unit={unit} domain={["auto", "auto"]} />
        <YAxis type="category" dataKey="name" {...axis} width={170} />
        <ReferenceLine x={0} stroke={C.ink2} />
        <Tooltip {...tip} formatter={(v) => (typeof v === "number" ? v.toFixed(2) : String(v))} />
        <Scatter isAnimationActive={false} data={data} fill={C.s1}>
          <ErrorBar dataKey="err" direction="x" width={6} stroke={C.s1} strokeWidth={2} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Small heatmap from rows of counts (sequential blue). */
export function Heatmap({ rows, rowKey, cols }: { rows: Record<string, string | number>[]; rowKey: string; cols: string[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => cols.map((c) => Number(r[c]) || 0)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="text-left font-normal text-muted">{rowKey}</th>
            {cols.map((c) => (
              <th key={c} className="font-normal text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[rowKey])}>
              <td className="pr-2 text-muted">{r[rowKey]}</td>
              {cols.map((c) => {
                const v = Number(r[c]) || 0;
                const step = Math.min(C.seq.length - 1, Math.floor((v / max) * (C.seq.length - 1)));
                return (
                  <td key={c} title={`${r[rowKey]} · ${c}: ${v}`} className="h-8 rounded text-center tabular-nums" style={{ background: v ? C.seq[step] : "#f3f2ee", color: step >= 4 ? "#fff" : "#0b0b0b" }}>
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const pct = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? "–" : `${(x * 100).toFixed(d)}%`);
export const fmtCI = (c: { estimate: number; lo: number; hi: number }, d = 2, unit = "") =>
  Number.isFinite(c.estimate) ? `${c.estimate.toFixed(d)}${unit} [${c.lo.toFixed(d)}, ${c.hi.toFixed(d)}]` : "–";

// ---------------- Self-explaining charts (used by the redesigned Overview) ----------------

export interface LegendItem {
  color: string;
  label: string;
  note?: string;
}

/** A row of colour keys, each with a plain-English meaning. */
export function LegendRow({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: i.color }} aria-hidden />
          <span className="font-semibold">{i.label}</span>
          {i.note && <span className="text-muted">{i.note}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Chart card for non-experts: the title is the question the chart answers, then how to read it,
 * the legend, the chart, and finally the answer in one sentence ("What it says").
 */
export function ExplainedChart({
  question,
  howToRead,
  legend,
  takeaway,
  children,
  className = "",
}: {
  question: string;
  howToRead: ReactNode;
  legend?: LegendItem[];
  takeaway: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card flex min-w-0 flex-col p-5 ${className}`}>
      <h3 className="font-display text-lg font-bold">{question}</h3>
      <p className="mt-1 text-sm text-muted">
        <span className="font-semibold text-ink">How to read it: </span>
        {howToRead}
      </p>
      {legend && (
        <div className="mt-3">
          <LegendRow items={legend} />
        </div>
      )}
      <div className="mt-3 flex-1">{children}</div>
      <p className="mt-3 rounded-xl bg-bg px-3 py-2 text-sm">
        <span className="font-semibold">💡 What it says: </span>
        {takeaway}
      </p>
    </section>
  );
}

const axisTitle = { fill: C.ink2, fontSize: 12, fontWeight: 600 } as const;

/** Bars (single or stacked series) with labelled axes and a readable tooltip. */
export function LabeledBars({
  data,
  x,
  series,
  xLabel,
  yLabel,
  height = 260,
  stacked = false,
  tooltipLabel,
  colorBy,
  unit = "",
  yMax,
  refLine,
  xInterval = 0,
}: {
  data: Record<string, unknown>[];
  x: string;
  series: { key: string; name: string; color: string }[];
  xLabel: string;
  yLabel: string;
  height?: number;
  stacked?: boolean;
  tooltipLabel?: (x: string) => string;
  colorBy?: (d: Record<string, unknown>) => string;
  /** unit shown on the y-axis ticks and in the tooltip, e.g. "%" or "s" */
  unit?: string;
  yMax?: number;
  /** a dashed horizontal line with a label, e.g. the fair share */
  refLine?: { y: number; label: string };
  /** which x labels to show: 0 = every one (default), "preserveStartEnd" = thin them out for long series */
  xInterval?: number | "preserveStartEnd";
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 8, bottom: 22 }} barCategoryGap={stacked ? "22%" : 3}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey={x} {...axis} interval={xInterval} minTickGap={12} label={{ value: xLabel, position: "insideBottom", offset: -14, ...axisTitle }} />
        <YAxis
          {...axis}
          unit={unit}
          domain={yMax != null ? [0, yMax] : undefined}
          allowDecimals={false}
          label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" }, ...axisTitle }}
        />
        <Tooltip {...tip} formatter={(v) => `${v}${unit}`} labelFormatter={(l) => (tooltipLabel ? tooltipLabel(String(l)) : String(l))} />
        {refLine && <ReferenceLine y={refLine.y} stroke={C.ink2} strokeDasharray="5 4" label={{ value: refLine.label, position: "insideTopRight", fill: C.ink2, fontSize: 11, fontWeight: 600 }} />}
        {series.map((s, i) => (
          <Bar
            isAnimationActive={false}
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color}
            stackId={stacked ? "a" : undefined}
            radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={stacked ? 46 : 40}
            stroke="#fff"
            strokeWidth={stacked ? 1.5 : 0}
          >
            {colorBy && !stacked && data.map((d, j) => <Cell key={j} fill={colorBy(d)} />)}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A key number with a one-line plain-English explanation (and an optional action). */
export function KeyNumber({
  label,
  value,
  explain,
  action,
  tone,
}: {
  label: string;
  value: string;
  explain: string;
  action?: { label: string; onClick: () => void };
  tone?: "warn";
}) {
  return (
    <div className={`card flex flex-col p-4 ${tone === "warn" ? "border-warn" : ""}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{value}</p>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{explain}</p>
      {action && (
        <button onClick={action.onClick} className="mt-3 w-fit rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Scatter with four named quadrants, so the corners say in words what they mean.
 * One dot per item (e.g. per session); colour groups come with a legend outside the chart.
 */
export function QuadrantScatter({
  groups,
  x,
  y,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  splitX,
  splitY,
  quadrants,
  pointLabel,
  height = 320,
}: {
  groups: { name: string; color: string; data: Record<string, unknown>[] }[];
  x: string;
  y: string;
  xLabel: string;
  yLabel: string;
  xDomain: [number, number];
  yDomain: [number, number];
  splitX: number;
  splitY: number;
  quadrants: { topLeft: string; topRight: string; bottomLeft: string; bottomRight: string };
  pointLabel?: (d: Record<string, unknown>) => string;
  height?: number;
}) {
  const q = (label: string, x1: number, x2: number, y1: number, y2: number, pos: "insideTopLeft" | "insideTopRight" | "insideBottomLeft" | "insideBottomRight") => (
    <ReferenceArea
      x1={x1}
      x2={x2}
      y1={y1}
      y2={y2}
      fill={C.grid}
      fillOpacity={0.18}
      stroke="none"
      ifOverflow="hidden"
      label={{ value: label, position: pos, fill: C.ink2, fontSize: 11, fontWeight: 600 }}
    />
  );
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ left: 8, right: 12, top: 8, bottom: 22 }}>
        <CartesianGrid stroke={C.grid} />
        {q(quadrants.topLeft, xDomain[0], splitX, splitY, yDomain[1], "insideTopLeft")}
        {q(quadrants.topRight, splitX, xDomain[1], splitY, yDomain[1], "insideTopRight")}
        {q(quadrants.bottomLeft, xDomain[0], splitX, yDomain[0], splitY, "insideBottomLeft")}
        {q(quadrants.bottomRight, splitX, xDomain[1], yDomain[0], splitY, "insideBottomRight")}
        <XAxis type="number" dataKey={x} domain={xDomain} allowDataOverflow {...axis} label={{ value: xLabel, position: "insideBottom", offset: -14, ...axisTitle }} />
        <YAxis
          type="number"
          dataKey={y}
          domain={yDomain}
          allowDataOverflow
          {...axis}
          label={{ value: yLabel, angle: -90, position: "insideLeft", offset: 4, style: { textAnchor: "middle" }, ...axisTitle }}
        />
        <ZAxis range={[40, 40]} />
        <ReferenceLine x={splitX} stroke={C.ink2} strokeDasharray="4 4" />
        <ReferenceLine y={splitY} stroke={C.ink2} strokeDasharray="4 4" />
        <Tooltip
          {...tip}
          cursor={{ strokeDasharray: "3 3" }}
          content={({ payload }) => {
            const d = payload?.[0]?.payload as Record<string, unknown> | undefined;
            if (!d) return null;
            return <div className="rounded-lg border border-line bg-white px-2 py-1 text-xs shadow">{pointLabel ? pointLabel(d) : `${d[x]}, ${d[y]}`}</div>;
          }}
        />
        {groups.map((g) => (
          <Scatter isAnimationActive={false} key={g.name} name={g.name} data={g.data} fill={g.color} fillOpacity={0.75} stroke="#fff" strokeWidth={1} />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/**
 * "How sure are we?" strip: the range the real difference most likely lies in (95% sure),
 * drawn around a "no difference" line. If the band crosses the line, we can't tell yet.
 */
export function CertaintyStrip({
  est,
  lo,
  hi,
  left,
  right,
  clear,
  title = "How sure are we?",
}: {
  est: number;
  lo: number;
  hi: number;
  left: string;
  right: string;
  clear: boolean;
  title?: string;
}) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const R = Math.max(1e-6, Math.abs(lo), Math.abs(hi), Math.abs(est)) * 1.25;
  const pos = (v: number) => `${((v + R) / (2 * R)) * 100}%`;
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="text-[11px] text-muted">The shaded band is where the real answer most likely is (95% sure). If it crosses the &ldquo;no difference&rdquo; line, we can&apos;t tell yet.</p>
      <div className="relative mt-3 h-6">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, background: clear ? "#b9e3b9" : "#d9d7d0" }} />
        <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: "50%" }} aria-hidden />
        <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: pos(est), background: C.ink2 }} />
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] text-muted">
        <span>← {left}</span>
        <span className="text-center font-semibold text-ink">No difference</span>
        <span className="text-right">{right} →</span>
      </div>
    </div>
  );
}
