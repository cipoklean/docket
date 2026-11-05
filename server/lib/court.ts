import { fail } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../db/index.js";

export const VERDICTS = ["ship", "cut", "fake"] as const;
export const STATUSES = ["todo", "doing", "done"] as const;

export function toIso(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    fail(`${field} must be an ISO 8601 date-time with a UTC offset.`, {
      errorCode: "invalid_time",
    });
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    fail(`${field} must be an ISO 8601 date-time.`, {
      errorCode: "invalid_time",
    });
  }
  return new Date(ms).toISOString();
}

export function parseDeliverables(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((d): d is string => typeof d === "string")
      : [];
    // coercion-ok: a corrupt deliverables column renders as no deliverables.
  } catch {
    return [];
  }
}

/** The hackathon row if the current user can see it, else a 404. */
export async function requireHackathon(id: string) {
  const { hackathons, hackathonShares } = schema;
  const [row] = await getDb()
    .select()
    .from(hackathons)
    .where(and(eq(hackathons.id, id), accessFilter(hackathons, hackathonShares)))
    .limit(1);
  if (!row) {
    fail("Hackathon not found.", { errorCode: "not_found", statusCode: 404 });
  }
  return row;
}

/** Weighted rubric score out of 100; null until at least one criterion is scored. */
export function weightedScore(
  rows: { weight: number; score: number | null }[],
): number | null {
  const scored = rows.filter((r) => r.score !== null);
  if (!scored.length) return null;
  const total = rows.reduce((sum, r) => sum + r.weight, 0) || 1;
  const points = rows.reduce((sum, r) => sum + r.weight * (r.score ?? 0), 0);
  return Math.round((points / (total * 10)) * 1000) / 10;
}

export const criterionOut = z.object({
  id: z.string(),
  name: z.string(),
  weight: z.number(),
  description: z.string().nullable(),
  score: z.number().nullable(),
  rationale: z.string().nullable(),
});

export const taskOut = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.enum(STATUSES),
  criterionId: z.string().nullable(),
  verdict: z.enum(VERDICTS).nullable(),
  recommendedVerdict: z.enum(VERDICTS).nullable(),
  courtArgument: z.string().nullable(),
  points: z.number().nullable(),
  position: z.number(),
});

export const checkOut = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(schema.CHECK_KINDS),
  param: z.string().nullable(),
  status: z.enum(["unknown", "pass", "fail"]),
  evidence: z.string().nullable(),
  checkedAt: z.string().nullable(),
});

export const hackathonDetailOut = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  deadlineAt: z.string(),
  prizeUsd: z.number().nullable(),
  summary: z.string().nullable(),
  deliverables: z.array(z.string()),
  submissionDraft: z.string().nullable(),
  demoScript: z.string().nullable(),
  repoUrl: z.string().nullable(),
  demoUrl: z.string().nullable(),
  score: z.number().nullable(),
  criteria: z.array(criterionOut),
  tasks: z.array(taskOut),
  checks: z.array(checkOut),
});

export async function loadDetail(id: string) {
  const h = await requireHackathon(id);
  const db = getDb();
  const [criteria, tasks, checks] = await Promise.all([
    db
      .select({
        id: schema.criteria.id,
        name: schema.criteria.name,
        weight: schema.criteria.weight,
        description: schema.criteria.description,
        score: schema.criteria.score,
        rationale: schema.criteria.rationale,
      })
      .from(schema.criteria)
      .where(eq(schema.criteria.hackathonId, id))
      .orderBy(asc(schema.criteria.position))
      .limit(50),
    db
      .select({
        id: schema.tasks.id,
        title: schema.tasks.title,
        notes: schema.tasks.notes,
        status: schema.tasks.status,
        criterionId: schema.tasks.criterionId,
        verdict: schema.tasks.verdict,
        recommendedVerdict: schema.tasks.recommendedVerdict,
        courtArgument: schema.tasks.courtArgument,
        points: schema.tasks.points,
        position: schema.tasks.position,
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.hackathonId, id))
      .orderBy(asc(schema.tasks.position))
      .limit(300),
    db
      .select({
        id: schema.checks.id,
        label: schema.checks.label,
        kind: schema.checks.kind,
        param: schema.checks.param,
        status: schema.checks.status,
        evidence: schema.checks.evidence,
        checkedAt: schema.checks.checkedAt,
      })
      .from(schema.checks)
      .where(eq(schema.checks.hackathonId, id))
      .orderBy(asc(schema.checks.position))
      .limit(60),
  ]);
  return {
    id: h.id,
    name: h.name,
    url: h.url,
    deadlineAt: h.deadlineAt,
    prizeUsd: h.prizeUsd,
    summary: h.summary,
    deliverables: parseDeliverables(h.deliverables),
    submissionDraft: h.submissionDraft,
    demoScript: h.demoScript,
    repoUrl: h.repoUrl,
    demoUrl: h.demoUrl,
    score: weightedScore(criteria),
    criteria,
    tasks,
    checks,
  };
}

/**
 * Map a criterion ref to its id. Models often echo a criterion's name, or a
 * mangled id, so match by id, then normalized name, then prefix.
 */
export function criterionResolver(rows: { id: string; name: string }[]) {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (ref: string): string | undefined => {
    const r = ref.trim();
    const n = norm(ref);
    return (
      rows.find((c) => c.id === r) ??
      rows.find((c) => norm(c.name) === n) ??
      rows.find(
        (c) =>
          n.length >= 4 &&
          (norm(c.name).startsWith(n) || n.startsWith(norm(c.name)) || c.id.startsWith(r)),
      )
    )?.id;
  };
}
