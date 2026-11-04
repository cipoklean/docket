import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { asc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the hackathons on the user's Ship Court boards, soonest deadline first.",
  schema: z.object({}),
  outputSchema: z.object({
    hackathons: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string().nullable(),
        deadlineAt: z.string(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "court", to: "/court" }),
    label: "Open Ship Court",
  }),
  run: async () => {
    const { hackathons, hackathonShares } = schema;
    const rows = await getDb()
      .select({
        id: hackathons.id,
        name: hackathons.name,
        url: hackathons.url,
        deadlineAt: hackathons.deadlineAt,
      })
      .from(hackathons)
      .where(accessFilter(hackathons, hackathonShares))
      .orderBy(asc(hackathons.deadlineAt))
      .limit(100);
    return { hackathons: rows };
  },
});
