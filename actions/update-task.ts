import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon, STATUSES, VERDICTS } from "../server/lib/court.js";

export default defineAction({
  description:
    'Patch one task: title, notes, status ("todo" | "doing" | "done"), linked criterion, or the verdict ("ship" | "cut" | "fake", null to clear). Send only the fields that change. Only the user rules a verdict unless they ask you to. For recommendations use recommend-verdicts.',
  schema: z.object({
    id: z.string().describe("Task id"),
    title: z.string().min(1).max(200).nullish().describe("New title"),
    notes: z.string().max(2000).nullable().optional().describe("Notes"),
    status: z.enum(STATUSES).nullish().describe('"todo", "doing" or "done"'),
    criterionId: z
      .string()
      .nullable()
      .optional()
      .describe("Criterion id, or null to unlink"),
    verdict: z
      .enum(VERDICTS)
      .nullable()
      .optional()
      .describe('Court ruling: "ship", "cut", "fake", or null'),
  }),
  outputSchema: z.object({ id: z.string(), updated: z.array(z.string()) }),
  run: async (args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    const db = getDb();
    const [task] = await db
      .select({ hackathonId: schema.tasks.hackathonId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, args.id))
      .limit(1);
    if (!task) fail("Task not found.", { errorCode: "not_found", statusCode: 404 });
    await requireHackathon(task.hackathonId, "editor");
    if (args.criterionId) {
      const [crit] = await db
        .select({ id: schema.criteria.id })
        .from(schema.criteria)
        .where(
          and(
            eq(schema.criteria.id, args.criterionId),
            eq(schema.criteria.hackathonId, task.hackathonId),
          ),
        )
        .limit(1);
      if (!crit) fail("Criterion not found on this board.", { errorCode: "not_found", statusCode: 404 });
    }
    const { id, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(
        ([k, v]) =>
          v !== undefined && !(v === null && (k === "title" || k === "status")),
      ),
    ) as Partial<typeof schema.tasks.$inferInsert>;
    const updated = Object.keys(patch);
    if (!updated.length) fail("Nothing to update.", { errorCode: "empty_patch" });
    await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id));
    return { id, updated };
  },
});
