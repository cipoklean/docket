import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon, toIso } from "../server/lib/court.js";

export default defineAction({
  description:
    "Patch a hackathon: name, deadline, summary, deliverables, submission draft (Markdown project description), or demo script. Only the fields you pass change.",
  schema: z.object({
    id: z.string().describe("Hackathon id"),
    name: z.string().min(1).optional().describe("New name"),
    deadlineAt: z
      .string()
      .optional()
      .describe("New deadline, ISO 8601 with offset"),
    summary: z.string().max(2000).optional().describe("Challenge summary"),
    deliverables: z
      .array(z.string().min(1))
      .max(20)
      .optional()
      .describe("Full replacement list of deliverables"),
    submissionDraft: z
      .string()
      .max(20000)
      .optional()
      .describe("Markdown submission text, written from what was actually built"),
    demoScript: z
      .string()
      .max(10000)
      .optional()
      .describe("Timed demo video script, e.g. 0:00-0:15 hook"),
  }),
  outputSchema: z.object({ id: z.string(), updated: z.array(z.string()) }),
  run: async (args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    await requireHackathon(args.id);
    const patch: Partial<typeof schema.hackathons.$inferInsert> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.deadlineAt !== undefined)
      patch.deadlineAt = toIso(args.deadlineAt, "deadlineAt");
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.deliverables !== undefined)
      patch.deliverables = JSON.stringify(args.deliverables);
    if (args.submissionDraft !== undefined)
      patch.submissionDraft = args.submissionDraft;
    if (args.demoScript !== undefined) patch.demoScript = args.demoScript;
    const updated = Object.keys(patch);
    if (!updated.length) {
      fail("Nothing to update.", { errorCode: "empty_patch" });
    }
    await getDb()
      .update(schema.hackathons)
      .set(patch)
      .where(eq(schema.hackathons.id, args.id));
    return { id: args.id, updated };
  },
});
