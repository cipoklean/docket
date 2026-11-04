import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon } from "../server/lib/court.js";
import { createVerifier } from "../server/lib/verify.js";

export default defineAction({
  description:
    "Verify every automatic check of a hackathon against the user's real repo and demo links (GitHub API, the demo page itself). Deterministic: no model judgment. Manual checks are left as the user set them.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    repoUrl: z.string().max(500).optional().describe("Save this repo link first, then verify"),
    demoUrl: z.string().max(500).optional().describe("Save this demo link first, then verify"),
  }),
  outputSchema: z.object({
    pass: z.number(),
    fail: z.number(),
    unknown: z.number(),
    results: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.enum(["unknown", "pass", "fail"]),
        evidence: z.string(),
      }),
    ),
  }),
  run: async ({ hackathonId, repoUrl, demoUrl }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    const db = getDb();
    // Links typed and checked in one tap are saved here, so the check never
    // reads the old ones.
    const patch: { repoUrl?: string | null; demoUrl?: string | null } = {};
    if (repoUrl !== undefined) patch.repoUrl = repoUrl.trim() || null;
    if (demoUrl !== undefined) patch.demoUrl = demoUrl.trim() || null;
    if (Object.keys(patch).length) {
      await requireHackathon(hackathonId);
      await db.update(schema.hackathons).set(patch).where(eq(schema.hackathons.id, hackathonId));
    }
    const h = await requireHackathon(hackathonId);
    const rows = await db
      .select()
      .from(schema.checks)
      .where(and(eq(schema.checks.hackathonId, h.id), ne(schema.checks.kind, "manual")))
      .limit(60);
    const verifier = createVerifier({ repoUrl: h.repoUrl, demoUrl: h.demoUrl });
    const checkedAt = new Date().toISOString();
    const results = await Promise.all(
      rows.map(async (r) => ({ id: r.id, label: r.label, ...(await verifier.check(r.kind, r.param, r.label)) })),
    );
    await Promise.all(
      results.map((r) =>
        db
          .update(schema.checks)
          .set({ status: r.status, evidence: r.evidence, checkedAt })
          .where(eq(schema.checks.id, r.id)),
      ),
    );
    const count = (s: string) => results.filter((r) => r.status === s).length;
    return { pass: count("pass"), fail: count("fail"), unknown: count("unknown"), results };
  },
});
