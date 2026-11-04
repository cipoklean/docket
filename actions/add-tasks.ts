import { defineAction, fail } from "@agent-native/core/action";
import { eq, max } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon } from "../server/lib/court.js";

export default defineAction({
  description:
    "Add one or more tasks to a hackathon board, appended in order. Optionally link each to a rubric criterion id.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    tasks: z
      .array(
        z.object({
          title: z.string().min(1).max(200).describe("Task title"),
          notes: z.string().max(2000).optional().describe("Details"),
          criterionId: z
            .string()
            .optional()
            .describe("Criterion id from get-hackathon"),
        }),
      )
      .min(1)
      .max(40)
      .describe("Tasks to add"),
  }),
  outputSchema: z.object({
    ids: z.array(z.string()),
    message: z.string(),
  }),
  run: async (args, ctx) => {
    const ownerEmail =
      ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
    const h = await requireHackathon(args.hackathonId);
    const db = getDb();
    const [agg] = await db
      .select({ top: max(schema.tasks.position) })
      .from(schema.tasks)
      .where(eq(schema.tasks.hackathonId, h.id));
    const start = (agg?.top ?? -1) + 1;
    const rows = args.tasks.map((t, i) => ({
      id: crypto.randomUUID(),
      hackathonId: h.id,
      title: t.title,
      notes: t.notes ?? null,
      criterionId: t.criterionId ?? null,
      position: start + i,
      ownerEmail,
      orgId: h.orgId,
    }));
    await db.insert(schema.tasks).values(rows);
    return {
      ids: rows.map((r) => r.id),
      message: `Added ${rows.length} task${rows.length === 1 ? "" : "s"}.`,
    };
  },
});
