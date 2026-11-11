"use client";
/**
 * Client behavioural tracker: one universal raw event stream (no per-game toggles).
 * Events are batched every 2s and flushed with sendBeacon when the tab is hidden,
 * so drop-offs are still captured. Scoring happens on the server, never here.
 */
export interface TrackEvent {
  type: string;
  round?: number | null;
  payload?: Record<string, unknown>;
  ts: number;
}

export class Tracker {
  private queue: TrackEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();
  private idleFired = false;
  private listeners: (() => void)[] = [];

  constructor(private sessionId: string) {}

  start() {
    this.timer = setInterval(() => {
      this.flush();
      if (!this.idleFired && Date.now() - this.lastActivity > 20_000) {
        this.idleFired = true;
        this.track("idle", null, { sinceMs: Date.now() - this.lastActivity });
      }
    }, 2000);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        this.track("visibility_hidden");
        this.flush(true);
      } else this.track("visibility_visible");
    };
    const onAct = () => {
      this.lastActivity = Date.now();
      this.idleFired = false;
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", onAct);
    window.addEventListener("keydown", onAct);
    window.addEventListener("pagehide", () => this.flush(true));
    this.listeners.push(
      () => document.removeEventListener("visibilitychange", onVis),
      () => window.removeEventListener("pointerdown", onAct),
      () => window.removeEventListener("keydown", onAct),
    );
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.listeners.forEach((f) => f());
    this.flush(true);
  }

  track(type: string, round: number | null = null, payload: Record<string, unknown> = {}) {
    this.queue.push({ type, round, payload, ts: Date.now() });
    if (this.queue.length > 150) this.flush();
  }

  flush(beacon = false) {
    if (!this.queue.length) return;
    const body = JSON.stringify({ sessionId: this.sessionId, events: this.queue.splice(0, 200) });
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
    }
  }
}

/** Coarse, privacy-friendly device fingerprint (hashed; used only for duplicate detection). */
export async function deviceHash(): Promise<string> {
  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency,
  ].join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return "dev_" + Array.from(new Uint8Array(buf).slice(0, 10), (b) => b.toString(16).padStart(2, "0")).join("");
}
