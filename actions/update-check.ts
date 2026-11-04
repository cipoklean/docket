import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireHackathon } from "../server/lib/court.js";

export default defineAction({
  description:
    "Tick or untick a manual check, rename a check, or delete one. Automatic checks get their status only from verify-checks.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    id: z.string().describe("Check id"),
    done: z.boolean().optional().describe("Manual checks only: true = done"),
    label: z.string().min(1).max(120).optional().describe("New label"),
    remove: z.boolean().optional().describe("Delete the check"),
  }),
  outputSchema: z.object({ id: z.string(), message: z.string() }),
  run: async (args, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    await requireHackathon(args.hackathonId);
    const db = getDb();
    const where = and(
      eq(schema.checks.id, args.id),
      eq(schema.checks.hackathonId, args.hackathonId),
    );
    const [row] = await db.select().from(schema.checks).where(where).limit(1);
    if (!row) fail("Check not found.", { errorCode: "not_found", statusCode: 404 });
    if (args.remove) {
      await db.delete(schema.checks).where(where);
      return { id: args.id, message: "Removed." };
    }
    const patch: Partial<typeof schema.checks.$inferInsert> = {};
    if (args.label !== undefined) patch.label = args.label;
    if (args.done !== undefined) {
      if (row.kind !== "manual")
        fail("Only manual checks can be ticked; run verify-checks for the rest.", {
          errorCode: "not_manual",
        });
      patch.status = args.done ? "pass" : "unknown";
      patch.checkedAt = new Date().toISOString();
    }
    if (!Object.keys(patch).length) fail("Nothing to update.", { errorCode: "empty_patch" });
    await db.update(schema.checks).set(patch).where(where);
    return { id: args.id, message: "Updated." };
  },
});
