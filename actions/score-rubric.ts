import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon, weightedScore } from "../server/lib/court.js";

export default defineAction({
  description:
    "Record rubric scores (0-10) with a one-sentence rationale per criterion, judged honestly against the tasks marked done, not planned work. Returns the new weighted total out of 100.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    scores: z
      .array(
        z.object({
          criterionId: z.string().describe("Criterion id from get-hackathon"),
          score: z.coerce.number().int().min(0).max(10).describe("0-10"),
          rationale: z
            .string()
            .min(1)
            .max(400)
            .describe("Why, and the single biggest gap to close"),
        }),
      )
      .min(1)
      .max(12)
      .describe("One entry per criterion scored"),
  }),
  outputSchema: z.object({
    hackathonId: z.string(),
    score: z.number().nullable(),
    message: z.string(),
  }),
  run: async (args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    const h = await requireHackathon(args.hackathonId);
    const c = schema.criteria;
    const db = getDb();
    const ids = args.scores.map((s) => s.criterionId);
    const known = await db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.hackathonId, h.id), inArray(c.id, ids)));
    if (known.length !== new Set(ids).size) {
      fail("One or more criterion ids do not belong to this hackathon.", {
        errorCode: "unknown_criterion",
      });
    }
    await db.transaction(async (tx) => {
      for (const s of args.scores) {
        await tx
          .update(c)
          .set({ score: s.score, rationale: s.rationale })
          .where(and(eq(c.id, s.criterionId), eq(c.hackathonId, h.id)));
      }
    });
    const rows = await db
      .select({ weight: c.weight, score: c.score })
      .from(c)
      .where(eq(c.hackathonId, h.id));
    const score = weightedScore(rows);
    return {
      hackathonId: h.id,
      score,
      message: `Rubric score is now ${score ?? "unscored"} / 100.`,
    };
  },
});
