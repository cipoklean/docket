import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { criterionResolver, requireHackathon, weightedScore } from "../server/lib/court.js";

export default defineAction({
  description:
    "Record rubric scores (0-10) with a one-sentence rationale per criterion, judged honestly against the tasks marked done, not planned work. Returns the new weighted total out of 100.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    scores: z
      .array(
        z.object({
          criterionId: z.string().describe("Criterion id from get-hackathon (its name also works)"),
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
    const resolve = criterionResolver(
      await db.select({ id: c.id, name: c.name }).from(c).where(eq(c.hackathonId, h.id)),
    );
    const scores = args.scores.flatMap((s) => {
      const id = resolve(s.criterionId);
      return id ? [{ ...s, criterionId: id }] : [];
    });
    if (!scores.length) {
      fail("No score matched a criterion. Use the criterion ids from get-hackathon.", {
        errorCode: "unknown_criterion",
      });
    }
    await db.transaction(async (tx) => {
      for (const s of scores) {
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
