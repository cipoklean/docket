import { defineAction, fail } from "@agent-native/core/action";
import { eq, max } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon } from "../server/lib/court.js";

export default defineAction({
  description:
    "Add submission rules from the hackathon's rules as checks Docket can verify. Use the most specific kind: repo_public (repo must be public), readme (README explains the project), license (open-source license required), uses_tech (param = the required technology, e.g. 'agent-native'), demo_live (demo link must open publicly; put a required platform such as Clips, X or YouTube in the label, never one the rules don't name), video_length (param = max minutes), manual (anything else, e.g. 'Submit the project form'). One check per rule; label is the rule in a few words. A rule the board already checks (same kind and param, or the same label for manual) is skipped.",
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
    const h = await requireHackathon(args.hackathonId, "editor");
    const db = getDb();
    const [agg] = await db
      .select({ top: max(schema.checks.position) })
      .from(schema.checks)
      .where(eq(schema.checks.hackathonId, h.id));
    const start = (agg?.top ?? -1) + 1;
    // A repeated import must not double the list: skip rules already checked.
    const key = (c: { kind: string; param?: string | null | undefined; label: string }) =>
      c.kind === "manual"
        ? `manual:${c.label.trim().toLowerCase()}`
        : `${c.kind}:${(c.param ?? "").trim().toLowerCase()}`;
    const existing = await db
      .select({ kind: schema.checks.kind, param: schema.checks.param, label: schema.checks.label })
      .from(schema.checks)
      .where(eq(schema.checks.hackathonId, h.id));
    const seen = new Set(existing.map(key));
    const fresh = args.checks.filter((c) => {
      const k = key(c);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (!fresh.length) return { ids: [], message: "Every rule is already checked." };
    const rows = fresh.map((c, i) => ({
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
      message: `Added ${rows.length} check${rows.length === 1 ? "" : "s"}${
        rows.length < args.checks.length ? `; skipped ${args.checks.length - rows.length} already on the board` : ""
      }.`,
    };
  },
});
