import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon, STATUSES, VERDICTS } from "../server/lib/court.js";

export default defineAction({
  description:
    'Patch a task: title, notes, status ("todo" | "doing" | "done"), linked criterion, the court ruling (verdict "ship" | "cut" | "fake", or null to clear), or the agent\'s recommendation (recommendedVerdict + courtArgument). Only passed fields change. Only the user rules a verdict unless they ask you to.',
  schema: z.object({
    id: z.string().describe("Task id"),
    title: z.string().min(1).max(200).optional().describe("New title"),
    notes: z.string().max(2000).nullable().optional().describe("Notes"),
    status: z.enum(STATUSES).optional().describe('"todo", "doing" or "done"'),
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
    recommendedVerdict: z
      .enum(VERDICTS)
      .nullable()
      .optional()
      .describe("Agent's recommended ruling for the court"),
    courtArgument: z
      .string()
      .max(1200)
      .nullable()
      .optional()
      .describe("Agent's one-paragraph case for its recommended ruling"),
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
    await requireHackathon(task.hackathonId);
    const { id, ...rest } = args;
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined),
    ) as Partial<typeof schema.tasks.$inferInsert>;
    const updated = Object.keys(patch);
    if (!updated.length) fail("Nothing to update.", { errorCode: "empty_patch" });
    await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id));
    return { id, updated };
  },
});
