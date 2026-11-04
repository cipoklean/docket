import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { hackathonDetailOut, loadDetail } from "../server/lib/court.js";

export default defineAction({
  description:
    "Get one hackathon board: deadline, rubric with current scores and weighted total (0-100), deliverables, tasks with status and court verdicts, and the submission draft.",
  schema: z.object({ id: z.string().describe("Hackathon id") }),
  outputSchema: hackathonDetailOut,
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "court",
      to: `/court/${encodeURIComponent(args.id)}`,
      params: { hackathonId: args.id },
    }),
    label: "Open board",
  }),
  run: async ({ id }) => loadDetail(id),
});
