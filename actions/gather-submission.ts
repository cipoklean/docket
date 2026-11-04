import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { loadDetail, requireHackathon } from "../server/lib/court.js";
import { snapshot } from "../server/lib/guard.js";
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
    "Collect everything a judge would see for one hackathon entry: the rubric, the repo README, the submission description, the demo script and link, check results, and optionally a past-winners page. Returns the evidence ids save-judgment requires, the score caps the guard will apply, and whether anything changed since the last judge pass. Call before save-judgment.",
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
      z.object({
        id: z.string(),
        name: z.string(),
        weight: z.number(),
        description: z.string().nullable(),
        score: z.number().nullable(),
      }),
    ),
    repo: z.object({ url: z.string(), title: z.string().nullable(), text: z.string() }).nullable(),
    demoUrl: z.string().nullable(),
    description: z.string().nullable(),
    demoScript: z.string().nullable(),
    checks: z.array(
      z.object({ id: z.string(), label: z.string(), status: z.string(), evidence: z.string().nullable() }),
    ),
    evidence: z.array(z.object({ id: z.string(), what: z.string() })),
    caps: z.array(z.object({ max: z.number(), reason: z.string() })),
    unchanged: z.boolean(),
    winners: z.object({ url: z.string(), title: z.string().nullable(), text: z.string() }).nullable(),
    missing: z.array(z.string()),
  }),
  readOnly: true,
  run: async ({ hackathonId, winnersUrl }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in first.", { statusCode: 401 });
    const [h, row] = await Promise.all([loadDetail(hackathonId), requireHackathon(hackathonId)]);
    const [snap, winners] = await Promise.all([snapshot(h), readOrNote(winnersUrl)]);
    const missing = [
      !h.repoUrl && "repo link",
      !snap.readme && h.repoUrl && "readable README",
      !h.demoUrl && "demo link",
      !h.submissionDraft?.trim() && "description",
    ].filter((m): m is string => Boolean(m));
    return {
      name: h.name,
      deadlineAt: h.deadlineAt,
      criteria: h.criteria.map(({ id, name, weight, description, score }) => ({
        id,
        name,
        weight,
        description,
        score,
      })),
      repo: snap.readme,
      demoUrl: h.demoUrl,
      description: h.submissionDraft,
      demoScript: h.demoScript,
      checks: h.checks.map(({ id, label, status, evidence }) => ({ id, label, status, evidence })),
      evidence: snap.evidence,
      caps: snap.caps,
      unchanged: row.judgedFingerprint === snap.fingerprint,
      winners,
      missing,
    };
  },
});
