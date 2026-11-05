import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  criterionResolver,
  loadDetail,
  requireHackathon,
  weightedScore,
} from "../server/lib/court.js";
import { guardScore, headroom, PROOFS, snapshot } from "../server/lib/guard.js";

export default defineAction({
  description:
    "Save a judge pass. The server guards it: each score above 0 must cite evidence ids from gather-submission (scores above 5 need two), scores are capped by what is missing or failing, each fix names what proves it done, fix points are clamped to what the criterion can still earn, and an unchanged submission is not re-judged. Fixes become tasks pinned at the top of the board; open fixes from the previous pass are replaced, done ones are kept.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    scores: z
      .array(
        z.object({
          criterionId: z.string().describe("Criterion id from gather-submission (its name also works)"),
          score: z.coerce.number().int().min(0).max(10),
          evidence: z
            .array(z.string())
            .max(8)
            .default([])
            .describe("Evidence ids from gather-submission that support this score, e.g. readme, demo, check:<id>"),
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
          proof: z
            .enum(PROOFS)
            .describe("What will show it is done: readme, description, demo, demo_script, or check"),
          checkId: z.string().optional().describe("When proof is check: the check that will turn green"),
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
    const row = await requireHackathon(args.hackathonId, "editor");
    const h = await loadDetail(row.id);
    const snap = await snapshot(h);
    if (row.judgedFingerprint === snap.fingerprint && h.score !== null) {
      fail(
        `Nothing a judge sees has changed since the last pass, so the score stays ${h.score}/100. Change the README, description, demo, or checks first.`,
        { errorCode: "unchanged" },
      );
    }

    const resolve = criterionResolver(h.criteria);
    const byId = new Map(h.criteria.map((c) => [c.id, c]));
    const notes: string[] = [];
    let rejected = 0;
    const scores = args.scores.flatMap((s) => {
      const id = resolve(s.criterionId);
      if (!id) return [];
      const g = guardScore(s.score, s.evidence, snap);
      if (g.rejected) rejected++;
      if (g.note && g.score < s.score) notes.push(`${byId.get(id)!.name} ${s.score}→${g.score} (${g.note})`);
      const rationale = g.note && g.score < s.score
        ? `${s.rationale.slice(0, 340)} Capped at ${g.score}: ${g.note}.`
        : s.rationale;
      return [{ criterionId: id, score: g.score, rationale }];
    });
    if (!scores.length) {
      fail(
        `No score matched a criterion. Use these ids: ${h.criteria.map((c) => `${c.id} (${c.name})`).join(", ")}.`,
        { errorCode: "unknown_criterion" },
      );
    }
    if (rejected === scores.length && args.scores.some((s) => s.score > 0)) {
      fail(
        `Every score lacked evidence. Cite ids from gather-submission: ${snap.evidence.map((e) => e.id).join(", ") || "none yet (add a README, description, or demo)"}.`,
        { errorCode: "no_evidence" },
      );
    }

    const newScore = new Map(scores.map((s) => [s.criterionId, s.score]));
    const checkIds = new Set(h.checks.filter((c) => c.status !== "pass").map((c) => c.id));
    let dropped = 0;
    const fixes = args.fixes.flatMap((f) => {
      const criterionId = resolve(f.criterionId) ?? null;
      if (f.proof === "check" && !(f.checkId && checkIds.has(f.checkId))) {
        dropped++;
        return [];
      }
      const c = criterionId ? byId.get(criterionId) : undefined;
      const room = c ? headroom(c.weight, newScore.get(c.id) ?? c.score) : f.points;
      const points = Math.min(f.points, room);
      if (points < 1) {
        dropped++;
        return [];
      }
      return [{ ...f, criterionId, points }];
    });

    const db = getDb();
    const c = schema.criteria;
    const tk = schema.tasks;
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
            orgId: row.orgId,
          })),
        );
      }
      await tx
        .update(schema.hackathons)
        .set({ judgedFingerprint: snap.fingerprint })
        .where(eq(schema.hackathons.id, h.id));
    });
    const rows = await db.select({ weight: c.weight, score: c.score }).from(c).where(eq(c.hackathonId, h.id));
    const score = weightedScore(rows);
    const gain = fixes.reduce((n, f) => n + f.points, 0);
    const parts = [
      `Judged ${score ?? "unscored"} / 100. ${fixes.length} fixes worth about +${gain}.`,
      notes.length ? `Guard lowered: ${notes.join("; ")}.` : "",
      dropped ? `${dropped} fixes dropped (no proof or no points left).` : "",
      scores.length < args.scores.length
        ? `${args.scores.length - scores.length} scores matched no criterion and were skipped.`
        : "",
    ];
    return { score, message: parts.filter(Boolean).join(" ") };
  },
});
