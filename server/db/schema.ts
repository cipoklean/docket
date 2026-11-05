import { sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  createSharesTable,
  ownableColumns,
} from "@agent-native/core/db/schema";

/**
 * A hackathon the user is entering. Times are UTC ISO strings
 * (Date#toISOString) so string order equals time order.
 */
export const hackathons = pgTable("hackathons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url"),
  deadlineAt: text("deadline_at").notNull(),
  summary: text("summary"),
  /** JSON array of strings: required deliverables (demo video, repo, form). */
  deliverables: text("deliverables").notNull().default("[]"),
  submissionDraft: text("submission_draft"),
  demoScript: text("demo_script"),
  /** The user's submission repo and demo video, checked by verify-checks. */
  repoUrl: text("repo_url"),
  demoUrl: text("demo_url"),
  /** Fingerprint of the submission at the last judge pass (server/lib/guard.ts). */
  judgedFingerprint: text("judged_fingerprint"),
  /** Total cash prize pool in USD, as the hackathon page states it. */
  prizeUsd: integer("prize_usd"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  ...ownableColumns(),
});
export const hackathonShares = createSharesTable("hackathon_shares");

/** One judging criterion of a hackathon rubric, scored 0-10 by the agent. */
export const criteria = pgTable("criteria", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id").notNull(),
  name: text("name").notNull(),
  weight: integer("weight").notNull(),
  description: text("description"),
  score: integer("score"),
  rationale: text("rationale"),
  position: integer("position").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

/** A unit of work toward the submission. */
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  status: text("status", { enum: ["todo", "doing", "done"] })
    .notNull()
    .default("todo"),
  criterionId: text("criterion_id"),
  /** Court ruling on an unfinished task: ship it, cut it, or fake it for the demo. */
  verdict: text("verdict", { enum: ["ship", "cut", "fake"] }),
  /** The agent's argument for its recommended verdict. */
  courtArgument: text("court_argument"),
  recommendedVerdict: text("recommended_verdict", {
    enum: ["ship", "cut", "fake"],
  }),
  /** Set on judge-pass fixes: estimated weighted points gained out of 100. */
  points: integer("points"),
  position: integer("position").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});

export const CHECK_KINDS = [
  "repo_public",
  "readme",
  "license",
  "uses_tech",
  "demo_live",
  "video_length",
  "manual",
] as const;

/**
 * One submission rule from the hackathon's rules, checked against the user's
 * real repo and demo. `param` carries the kind's argument (a tech name for
 * uses_tech, max minutes for video_length).
 */
export const checks = pgTable("checks", {
  id: text("id").primaryKey(),
  hackathonId: text("hackathon_id").notNull(),
  label: text("label").notNull(),
  kind: text("kind", { enum: CHECK_KINDS }).notNull(),
  param: text("param"),
  status: text("status", { enum: ["unknown", "pass", "fail"] })
    .notNull()
    .default("unknown"),
  evidence: text("evidence"),
  checkedAt: text("checked_at"),
  position: integer("position").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});
