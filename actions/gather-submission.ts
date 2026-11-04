import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { loadDetail } from "../server/lib/court.js";
import { readLink } from "../server/lib/reader.js";

const CLIP = 15_000;

async function readOrNote(url: string | null | undefined) {
  if (!url) return null;
  try {
    const r = await readLink(url);
    return { url, title: r.title, text: r.markdown.slice(0, CLIP) };
  } catch (err) {
    return { url, title: null, text: `Could not read: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

export default defineAction({
  description:
    "Collect everything a judge would see for one hackathon entry: the rubric, the repo README, the submission description, the demo script and link, check results, and optionally a past-winners page. Call before save-judgment.",
  schema: z.object({
    hackathonId: z.string().describe("Hackathon id"),
    winnersUrl: z
      .string()
      .optional()
      .describe("A page of past winners or the project gallery, if the hackathon links one"),
  }),
  outputSchema: z.object({
    name: z.string(),
    deadlineAt: z.string(),
    criteria: z.array(
      z.object({ id: z.string(), name: z.string(), weight: z.number(), description: z.string().nullable() }),
    ),
    repo: z.object({ url: z.string(), title: z.string().nullable(), text: z.string() }).nullable(),
    demoUrl: z.string().nullable(),
    description: z.string().nullable(),
    demoScript: z.string().nullable(),
    checks: z.array(z.object({ label: z.string(), status: z.string(), evidence: z.string().nullable() })),
    winners: z.object({ url: z.string(), title: z.string().nullable(), text: z.string() }).nullable(),
    missing: z.array(z.string()),
  }),
  readOnly: true,
  run: async ({ hackathonId, winnersUrl }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    const h = await loadDetail(hackathonId);
    const [repo, winners] = await Promise.all([readOrNote(h.repoUrl), readOrNote(winnersUrl)]);
    const missing = [
      !h.repoUrl && "repo link",
      !h.demoUrl && "demo link",
      !h.submissionDraft?.trim() && "description",
    ].filter((m): m is string => Boolean(m));
    return {
      name: h.name,
      deadlineAt: h.deadlineAt,
      criteria: h.criteria.map(({ id, name, weight, description }) => ({ id, name, weight, description })),
      repo,
      demoUrl: h.demoUrl,
      description: h.submissionDraft,
      demoScript: h.demoScript,
      checks: h.checks.map(({ label, status, evidence }) => ({ label, status, evidence })),
      winners,
      missing,
    };
  },
});
