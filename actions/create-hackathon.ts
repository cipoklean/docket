import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { toIso } from "../server/lib/court.js";

export default defineAction({
  description:
    "Create a hackathon board from its rules. Importing a URL that already has a board returns that board instead of a copy: name, deadline, prize pool, rubric criteria (weights in percent, should total 100), deliverables, and starter tasks. Read the page with read-link first; never invent a deadline or rubric the page does not state.",
  schema: z.object({
    name: z.string().min(1).describe("Hackathon name"),
    url: z.string().url().optional().describe("Hackathon page URL"),
    deadlineAt: z
      .string()
      .describe(
        "Submission deadline, ISO 8601 with offset, e.g. 2026-11-09T23:59:00-08:00",
      ),
    prizeUsd: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Total cash prize pool in USD, only when the page states it"),
    summary: z
      .string()
      .max(2000)
      .optional()
      .describe("Two or three sentences: the challenge and what wins"),
    deliverables: z
      .array(z.string().min(1))
      .max(20)
      .default([])
      .describe("Required submission items, e.g. 'Public Clips demo'"),
    criteria: z
      .array(
        z.object({
          name: z.string().min(1).describe("Criterion name"),
          weight: z.coerce
            .number()
            .int()
            .min(0)
            .max(100)
            .describe("Weight in percent"),
          description: z.string().optional().describe("What judges look for"),
        }),
      )
      .min(1)
      .max(12)
      .describe("Judging rubric"),
    tasks: z
      .array(
        z.object({
          title: z.string().min(1).describe("Task title"),
          notes: z.string().optional().describe("Details"),
          criterion: z
            .string()
            .optional()
            .describe("Name of the criterion this task moves, if any"),
        }),
      )
      .max(60)
      .default([])
      .describe("Starter tasks"),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    deadlineAt: z.string(),
    criteriaCount: z.number(),
    taskCount: z.number(),
    weightTotal: z.number(),
    message: z.string(),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "court",
      to: `/court/${encodeURIComponent(result.id)}`,
      params: { hackathonId: result.id },
    }),
    label: `Open ${result.name}`,
  }),
  run: async (args, ctx) => {
    const ownerEmail =
      ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
    const orgId = ctx?.orgId ?? null;
    const deadlineAt = toIso(args.deadlineAt, "deadlineAt");
    const existing = args.url ? await findByUrl(args.url) : null;
    if (existing) return existing;
    const id = crypto.randomUUID();
    const weightTotal = args.criteria.reduce((s, c) => s + c.weight, 0);
    const criteriaRows = args.criteria.map((c, i) => ({
      id: crypto.randomUUID(),
      hackathonId: id,
      name: c.name,
      weight: c.weight,
      description: c.description ?? null,
      position: i,
      ownerEmail,
      orgId,
    }));
    const byName = new Map(
      criteriaRows.map((c) => [c.name.toLowerCase(), c.id]),
    );
    const taskRows = args.tasks.map((t, i) => ({
      id: crypto.randomUUID(),
      hackathonId: id,
      title: t.title,
      notes: t.notes ?? null,
      criterionId: t.criterion
        ? (byName.get(t.criterion.toLowerCase()) ?? null)
        : null,
      position: i,
      ownerEmail,
      orgId,
    }));
    await getDb().transaction(async (tx) => {
      await tx.insert(schema.hackathons).values({
        id,
        name: args.name,
        url: args.url ?? null,
        deadlineAt,
        prizeUsd: args.prizeUsd ?? null,
        summary: args.summary ?? null,
        deliverables: JSON.stringify(args.deliverables),
        ownerEmail,
        orgId,
        visibility: orgId ? ("org" as const) : ("private" as const),
      });
      await tx.insert(schema.criteria).values(criteriaRows);
      if (taskRows.length) await tx.insert(schema.tasks).values(taskRows);
    });
    return {
      id,
      name: args.name,
      deadlineAt,
      criteriaCount: criteriaRows.length,
      taskCount: taskRows.length,
      weightTotal,
      message:
        weightTotal === 100
          ? `Created ${args.name}.`
          : `Created ${args.name}; rubric weights total ${weightTotal}%, not 100%.`,
    };
  },
});

/** Same page, ignoring protocol, www, trailing slash, query and hash. */
function pageKey(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

// One page, one board: a repeated import (a retried or doubled chat
// submission) returns the board that already exists.
async function findByUrl(url: string) {
  const { hackathons, hackathonShares, criteria, tasks } = schema;
  const db = getDb();
  const key = pageKey(url);
  const rows = await db
    .select({
      id: hackathons.id,
      name: hackathons.name,
      url: hackathons.url,
      deadlineAt: hackathons.deadlineAt,
    })
    .from(hackathons)
    .where(
      and(accessFilter(hackathons, hackathonShares), isNotNull(hackathons.url)),
    );
  const hit = rows.find((r) => r.url && pageKey(r.url) === key);
  if (!hit) return null;
  const crit = await db
    .select({ weight: criteria.weight })
    .from(criteria)
    .where(eq(criteria.hackathonId, hit.id));
  const [counted] = await db
    .select({ n: count() })
    .from(tasks)
    .where(eq(tasks.hackathonId, hit.id));
  return {
    id: hit.id,
    name: hit.name,
    deadlineAt: hit.deadlineAt,
    criteriaCount: crit.length,
    taskCount: Number(counted?.n ?? 0),
    weightTotal: crit.reduce((s, c) => s + c.weight, 0),
    message: `${hit.name} already has a board; returned it instead of a copy.`,
  };
}
