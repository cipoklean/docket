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
  position: integer("position").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});
