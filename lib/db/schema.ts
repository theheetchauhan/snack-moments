import { bigint, boolean, integer, jsonb, pgTable, real, serial, text } from "drizzle-orm/pg-core";
import type { SessionData } from "@/lib/session/types";

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),
  deviceHash: text("device_hash").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  trustAlpha: real("trust_alpha").notNull().default(2),
  trustBeta: real("trust_beta").notNull().default(1),
  studies: integer("studies").notNull().default(0),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  studyId: text("study_id").notNull(),
  participantId: text("participant_id").notNull(),
  deviceHash: text("device_hash").notNull(),
  ipHash: text("ip_hash").notNull(),
  framing: text("framing").notNull(),
  anchor: text("anchor").notNull(),
  segment: text("segment").notNull(),
  status: text("status").notNull(),
  stage: text("stage").notNull(),
  startedAt: bigint("started_at", { mode: "number" }).notNull(),
  completedAt: bigint("completed_at", { mode: "number" }),
  simulated: boolean("simulated").notNull().default(false),
  archetype: text("archetype"),
  data: jsonb("data").$type<SessionData>().notNull(),
});

export const eventLog = pgTable("event_log", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  round: integer("round"),
  payload: jsonb("payload"),
  clientTs: bigint("client_ts", { mode: "number" }),
  serverTs: bigint("server_ts", { mode: "number" }).notNull(),
});

export const sessionScores = pgTable("session_scores", {
  sessionId: text("session_id").primaryKey(),
  quality: integer("quality").notNull(),
  band: text("band").notNull(),
  weight: real("weight").notNull(),
  engagement: integer("engagement").notNull(),
  signals: jsonb("signals").notNull(),
  divergence: jsonb("divergence").notNull(),
  engagementParts: jsonb("engagement_parts").notNull(),
  version: text("version").notNull(),
  aiExplanation: text("ai_explanation"),
  computedAt: bigint("computed_at", { mode: "number" }).notNull(),
});

export const reviewLabels = pgTable("review_labels", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  label: text("label").notNull(), // approve | downweight | exclude
  note: text("note"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const aiCache = pgTable("ai_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const studioRuns = pgTable("studio_runs", {
  id: text("id").primaryKey(),
  input: jsonb("input").notNull(),
  output: jsonb("output").notNull(),
  models: jsonb("models").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});

export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS participants (
  id text PRIMARY KEY, device_hash text NOT NULL, created_at bigint NOT NULL,
  trust_alpha real NOT NULL DEFAULT 2, trust_beta real NOT NULL DEFAULT 1, studies integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY, study_id text NOT NULL, participant_id text NOT NULL, device_hash text NOT NULL,
  ip_hash text NOT NULL, framing text NOT NULL, anchor text NOT NULL, segment text NOT NULL,
  status text NOT NULL, stage text NOT NULL, started_at bigint NOT NULL, completed_at bigint,
  simulated boolean NOT NULL DEFAULT false, archetype text, data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_study_idx ON sessions(study_id);
CREATE TABLE IF NOT EXISTS event_log (
  id serial PRIMARY KEY, session_id text NOT NULL, type text NOT NULL, round integer,
  payload jsonb, client_ts bigint, server_ts bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS event_session_idx ON event_log(session_id);
CREATE TABLE IF NOT EXISTS session_scores (
  session_id text PRIMARY KEY, quality integer NOT NULL, band text NOT NULL, weight real NOT NULL,
  engagement integer NOT NULL, signals jsonb NOT NULL, divergence jsonb NOT NULL,
  engagement_parts jsonb NOT NULL, version text NOT NULL, ai_explanation text, computed_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS review_labels (
  id serial PRIMARY KEY, session_id text NOT NULL, label text NOT NULL, note text, created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_cache (key text PRIMARY KEY, value jsonb NOT NULL, created_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS studio_runs (
  id text PRIMARY KEY, input jsonb NOT NULL, output jsonb NOT NULL, models jsonb NOT NULL, created_at bigint NOT NULL
);
`;
