import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { criterionResolver, requireHackathon, weightedScore } from "../server/lib/court.js";

export default defineAction({
  description:
    "Save a judge pass: score every criterion 0-10 from the actual submission (not plans), and the fixes that would gain the most weighted points, most valuable first (max 3). Fixes become tasks pinned at the top of the board; open fixes from the previous pass are replaced, done ones are kept.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    scores: z
      .array(
        z.object({
          criterionId: z.string().describe("Criterion id from gather-submission (its name also works)"),
          score: z.coerce.number().int().min(0).max(10),
          rationale: z.string().min(1).max(400).describe("What a judge sees, and the biggest gap"),
        }),
      )
      .min(1)
      .max(12),
    fixes: z
      .array(
        z.object({
          title: z.string().min(1).max(160).describe("A concrete fix, doable before the deadline"),
          criterionId: z.string().describe("Criterion it moves: id from gather-submission (its name also works)"),
          points: z.coerce
            .number()
            .int()
            .min(1)
            .max(40)
            .describe("Estimated weighted points gained out of 100"),
          why: z.string().max(400).optional().describe("One line: why judges reward this"),
        }),
      )
      .max(3),
  }),
  outputSchema: z.object({ score: z.number().nullable(), message: z.string() }),
  run: async (args, ctx) => {
    const ownerEmail = ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
    const h = await requireHackathon(args.hackathonId);
    const c = schema.criteria;
    const tk = schema.tasks;
    const db = getDb();
    const rows0 = await db
      .select({ id: c.id, name: c.name })
      .from(c)
      .where(eq(c.hackathonId, h.id));
    const resolve = criterionResolver(rows0);
    const scores = args.scores.flatMap((s) => {
      const id = resolve(s.criterionId);
      return id ? [{ ...s, criterionId: id }] : [];
    });
    if (!scores.length) {
      fail(
        `No score matched a criterion. Use these ids: ${rows0.map((r) => `${r.id} (${r.name})`).join(", ")}.`,
        { errorCode: "unknown_criterion" },
      );
    }
    const fixes = args.fixes.map((f) => ({ ...f, criterionId: resolve(f.criterionId) ?? null }));
    await db.transaction(async (tx) => {
      for (const s of scores) {
        await tx
          .update(c)
          .set({ score: s.score, rationale: s.rationale })
          .where(and(eq(c.id, s.criterionId), eq(c.hackathonId, h.id)));
      }
      await tx
        .delete(tk)
        .where(and(eq(tk.hackathonId, h.id), isNotNull(tk.points), ne(tk.status, "done")));
      if (fixes.length) {
        await tx.insert(tk).values(
          fixes.map((f, i) => ({
            id: crypto.randomUUID(),
            hackathonId: h.id,
            title: f.title,
            notes: f.why ?? null,
            criterionId: f.criterionId,
            points: f.points,
            position: -100 + i,
            ownerEmail,
            orgId: h.orgId,
          })),
        );
      }
    });
    const rows = await db.select({ weight: c.weight, score: c.score }).from(c).where(eq(c.hackathonId, h.id));
    const score = weightedScore(rows);
    const gain = fixes.reduce((n, f) => n + f.points, 0);
    return {
      score,
      message: `Judged ${score ?? "unscored"} / 100. ${fixes.length} fixes worth about +${gain}.${scores.length < args.scores.length ? ` ${args.scores.length - scores.length} scores matched no criterion and were skipped.` : ""}`,
    };
  },
});
