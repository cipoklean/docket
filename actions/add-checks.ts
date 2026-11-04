import { defineAction, fail } from "@agent-native/core/action";
import { eq, max } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon } from "../server/lib/court.js";

export default defineAction({
  description:
    "Add submission rules from the hackathon's rules as checks Docket can verify. Use the most specific kind: repo_public (repo must be public), readme (README explains the project), license (open-source license required), uses_tech (param = the required technology, e.g. 'agent-native'), demo_live (demo link must open publicly), video_length (param = max minutes), manual (anything else, e.g. 'Submit the project form'). One check per rule; label is the rule in a few words.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    checks: z
      .array(
        z.object({
          label: z.string().min(1).max(120).describe("The rule, a few words"),
          kind: z.enum(schema.CHECK_KINDS).describe("How Docket verifies it"),
          param: z
            .string()
            .max(80)
            .optional()
            .describe("Tech name for uses_tech, max minutes for video_length"),
        }),
      )
      .min(1)
      .max(30),
  }),
  outputSchema: z.object({ ids: z.array(z.string()), message: z.string() }),
  run: async (args, ctx) => {
    const ownerEmail =
      ctx?.userEmail ?? fail("Sign in first.", { statusCode: 401 });
    const h = await requireHackathon(args.hackathonId);
    const db = getDb();
    const [agg] = await db
      .select({ top: max(schema.checks.position) })
      .from(schema.checks)
      .where(eq(schema.checks.hackathonId, h.id));
    const start = (agg?.top ?? -1) + 1;
    const rows = args.checks.map((c, i) => ({
      id: crypto.randomUUID(),
      hackathonId: h.id,
      label: c.label,
      kind: c.kind,
      param: c.param ?? null,
      position: start + i,
      ownerEmail,
      orgId: h.orgId,
    }));
    await db.insert(schema.checks).values(rows);
    return {
      ids: rows.map((r) => r.id),
      message: `Added ${rows.length} check${rows.length === 1 ? "" : "s"}.`,
    };
  },
});
