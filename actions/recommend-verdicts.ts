import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon, VERDICTS } from "../server/lib/court.js";

export default defineAction({
  description:
    "Recommend ship, fake, or cut for open tasks on one board, each with a one-line argument. One call covers every task. Sets only the recommendation; the user rules the verdict.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    recommendations: z
      .array(
        z.object({
          taskId: z.string().describe("Task id"),
          verdict: z.enum(VERDICTS).describe('"ship", "fake" or "cut"'),
          argument: z
            .string()
            .min(1)
            .max(400)
            .describe("One line: why, weighing time left against weight"),
        }),
      )
      .min(1)
      .max(60),
  }),
  outputSchema: z.object({
    saved: z.number(),
    skipped: z.array(z.string()),
  }),
  run: async (args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    await requireHackathon(args.hackathonId, "editor");
    const db = getDb();
    const ids = args.recommendations.map((r) => r.taskId);
    const open = await db
      .select({ id: schema.tasks.id, status: schema.tasks.status })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.hackathonId, args.hackathonId),
          inArray(schema.tasks.id, ids),
        ),
      );
    const valid = new Set(
      open.filter((t) => t.status !== "done").map((t) => t.id),
    );
    const skipped = ids.filter((id) => !valid.has(id));
    const keep = args.recommendations.filter((r) => valid.has(r.taskId));
    if (!keep.length)
      fail("None of those tasks are open on this board.", {
        errorCode: "no_open_tasks",
      });
    await db.transaction(async (tx) => {
      for (const r of keep) {
        await tx
          .update(schema.tasks)
          .set({ recommendedVerdict: r.verdict, courtArgument: r.argument })
          .where(eq(schema.tasks.id, r.taskId));
      }
    });
    return { saved: keep.length, skipped };
  },
});
