import { fail } from "@agent-native/core/action";
import { lt, sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

/** Hourly caps per user for actions that make the server fetch the web. */
export const LIMITS = {
  "read-link": 40,
  "create-hackathon": 15,
  "verify-checks": 30,
} as const;

const WINDOW_MS = 60 * 60 * 1000;

/**
 * Count one call against the user's hourly cap for `bucket`; past the cap the
 * action fails with 429. Counters live in Postgres so the cap holds across
 * serverless instances.
 */
export async function takeRate(userEmail: string, bucket: keyof typeof LIMITS) {
  const db = getDb();
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const subject = userEmail.trim().toLowerCase();
  const [row] = await db
    .insert(schema.rateHits)
    .values({ subject, bucket, windowStart, hits: 1 })
    .onConflictDoUpdate({
      target: [schema.rateHits.subject, schema.rateHits.bucket, schema.rateHits.windowStart],
      set: { hits: sql`${schema.rateHits.hits} + 1` },
    })
    .returning({ hits: schema.rateHits.hits });
  // Old windows are dead weight; drop them now and then.
  if (Math.random() < 0.02) {
    await db.delete(schema.rateHits).where(lt(schema.rateHits.windowStart, windowStart - WINDOW_MS));
  }
  if ((row?.hits ?? 0) > LIMITS[bucket]) {
    const mins = Math.ceil((windowStart + WINDOW_MS - Date.now()) / 60_000);
    fail(`Too many requests. Try again in ${mins} min.`, {
      errorCode: "rate_limited",
      statusCode: 429,
    });
  }
}
