/**
 * Judge guard. The model proposes a judgment; this decides what it may save.
 * Every rule here is deterministic, so a judge pass can't be talked into a
 * better score than the submission supports.
 *
 * 1. Every score above 0 cites evidence ids that gather-submission returned.
 * 2. Hard caps from what is missing or failing (no README, no demo, a failed check).
 * 3. Every fix names what will prove it done, and its points fit the gap left.
 * 4. Nothing changed since the last pass, nothing to re-judge.
 */
import { createHash } from "node:crypto";

import { readLink } from "./reader.js";

export interface Evidence {
  id: string;
  what: string;
}

export interface Snapshot {
  evidence: Evidence[];
  /** Hash of everything a judge sees. Same hash, same submission. */
  fingerprint: string;
  readme: { url: string; title: string | null; text: string } | null;
  caps: { max: number; reason: string }[];
}

interface Input {
  repoUrl: string | null;
  demoUrl: string | null;
  submissionDraft: string | null;
  demoScript: string | null;
  checks: { id: string; label: string; kind: string; status: string; evidence: string | null }[];
}

const CLIP = 15_000;
const MIN_WORDS = 50;
const words = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean).length;

export async function snapshot(h: Input): Promise<Snapshot> {
  let readme: Snapshot["readme"] = null;
  if (h.repoUrl) {
    try {
      const r = await readLink(h.repoUrl);
      readme = { url: h.repoUrl, title: r.title, text: r.markdown.slice(0, CLIP) };
    } catch {
      readme = null;
    }
  }

  const evidence: Evidence[] = [];
  if (readme && words(readme.text) >= MIN_WORDS)
    evidence.push({ id: "readme", what: `README, ${words(readme.text)} words` });
  if (words(h.submissionDraft) >= 20)
    evidence.push({ id: "description", what: `Submission description, ${words(h.submissionDraft)} words` });
  if (words(h.demoScript) >= 20) evidence.push({ id: "demo_script", what: "Demo script" });
  if (h.demoUrl) evidence.push({ id: "demo", what: `Demo link ${h.demoUrl}` });
  for (const c of h.checks) {
    if (c.status === "pass")
      evidence.push({ id: `check:${c.id}`, what: `Passed: ${c.label}${c.evidence ? ` (${c.evidence})` : ""}` });
  }

  const caps: Snapshot["caps"] = [];
  if (!evidence.some((e) => e.id === "readme"))
    caps.push({ max: 3, reason: "no readable README" });
  const demoFailed = h.checks.some(
    (c) => (c.kind === "demo_live" || c.kind === "video_length") && c.status === "fail",
  );
  if (!h.demoUrl || demoFailed)
    caps.push({ max: 5, reason: h.demoUrl ? "demo check failed" : "no demo link" });
  const failed = h.checks.filter((c) => c.kind !== "manual" && c.status === "fail");
  if (failed.length)
    caps.push({ max: 7, reason: `failed check: ${failed[0]!.label}` });

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        readme?.text ?? null,
        h.submissionDraft?.trim() ?? null,
        h.demoScript?.trim() ?? null,
        h.demoUrl ?? null,
        h.checks.map((c) => [c.id, c.status]).sort(),
      ]),
    )
    .digest("hex")
    .slice(0, 16);

  return { evidence, fingerprint, readme, caps };
}

/** The highest score the guard allows, and why it is lower than asked, if it is. */
export function guardScore(
  asked: number,
  cited: string[],
  snap: Snapshot,
): { score: number; note: string | null; rejected: boolean } {
  const known = new Set(snap.evidence.map((e) => e.id));
  const valid = [...new Set(cited.filter((id) => known.has(id)))];
  if (asked > 0 && valid.length === 0)
    return { score: 0, note: "no evidence cited", rejected: true };
  let score = asked;
  let note: string | null = null;
  // A strong score needs more than one thing a judge can see.
  if (score > 5 && valid.length < 2) {
    score = 5;
    note = "one piece of evidence";
  }
  for (const cap of snap.caps) {
    if (score > cap.max) {
      score = cap.max;
      note = cap.reason;
    }
  }
  return { score, note, rejected: false };
}

export const PROOFS = ["readme", "description", "demo", "demo_script", "check"] as const;
export type Proof = (typeof PROOFS)[number];

/** Weighted points a criterion can still earn out of 100. */
export const headroom = (weight: number, score: number | null) =>
  Math.max(0, Math.round(((10 - (score ?? 0)) * weight) / 10));
