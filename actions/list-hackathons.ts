import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { asc, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { weightedScore } from "../server/lib/court.js";

const CLASH_MS = 48 * 3_600_000;

export default defineAction({
  description:
    "Radar: every hackathon on the user's boards, open ones first by deadline, with the prize pool in USD, the judged score out of 100, and clashesWith: other open hackathons due within 48 hours of this one.",
  schema: z.object({}),
  outputSchema: z.object({
    hackathons: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string().nullable(),
        deadlineAt: z.string(),
        open: z.boolean(),
        prizeUsd: z.number().nullable(),
        score: z.number().nullable(),
        clashesWith: z.array(z.string()),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "court", to: "/court" }),
    label: "Open Docket",
  }),
  run: async () => {
    const { hackathons, hackathonShares, criteria } = schema;
    const db = getDb();
    const rows = await db
      .select({
        id: hackathons.id,
        name: hackathons.name,
        url: hackathons.url,
        deadlineAt: hackathons.deadlineAt,
        prizeUsd: hackathons.prizeUsd,
      })
      .from(hackathons)
      .where(accessFilter(hackathons, hackathonShares))
      .orderBy(asc(hackathons.deadlineAt))
      .limit(100);
    const scores = rows.length
      ? await db
          .select({
            hackathonId: criteria.hackathonId,
            weight: criteria.weight,
            score: criteria.score,
          })
          .from(criteria)
          .where(
            inArray(
              criteria.hackathonId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    const now = Date.now();
    const at = (r: { deadlineAt: string }) => Date.parse(r.deadlineAt);
    const live = rows.filter((r) => at(r) > now);
    const out = rows.map((r) => {
      const open = at(r) > now;
      return {
        ...r,
        open,
        score: weightedScore(scores.filter((s) => s.hackathonId === r.id)),
        clashesWith: open
          ? live
              .filter(
                (o) => o.id !== r.id && Math.abs(at(o) - at(r)) <= CLASH_MS,
              )
              .map((o) => o.name)
          : [],
      };
    });
    // Open first by deadline, then closed, most recent first.
    out.sort((a, b) =>
      a.open !== b.open
        ? a.open
          ? -1
          : 1
        : a.open
          ? at(a) - at(b)
          : at(b) - at(a),
    );
    return { hackathons: out };
  },
});
