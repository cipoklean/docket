/**
 * Deterministic submission checks. Each one looks at the user's real repo or
 * demo link and returns pass, fail, or unknown with one line of evidence.
 * No model is involved: the point is that a check can't be talked into green.
 */
import { assertPublicUrlDns, get } from "./reader.js";

export type CheckKind =
  | "repo_public"
  | "readme"
  | "license"
  | "uses_tech"
  | "demo_live"
  | "video_length"
  | "manual";

export interface CheckResult {
  status: "unknown" | "pass" | "fail";
  evidence: string;
}

interface Links {
  repoUrl: string | null;
  demoUrl: string | null;
}

const GH = "https://api.github.com";

function parseRepo(repoUrl: string | null): { owner: string; repo: string } | null {
  if (!repoUrl) return null;
  const m = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(repoUrl);
  const [, owner, repo] = m ?? [];
  if (!owner || !repo) return null;
  return { owner, repo: repo.replace(/\.git$/, "") };
}

async function ghJson(path: string): Promise<{ status: number; body: any }> {
  const res = await get(`${GH}${path}`, "application/vnd.github+json");
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Shared per-run cache so several checks on one repo cost one request each. */
export function createVerifier(links: Links) {
  const repo = parseRepo(links.repoUrl);
  const cache = new Map<string, Promise<any>>();
  const once = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, load());
    return cache.get(key) as Promise<T>;
  };

  const repoInfo = () => once("repo", () => ghJson(`/repos/${repo!.owner}/${repo!.repo}`));
  const readme = () =>
    once("readme", async () => {
      const r = await ghJson(`/repos/${repo!.owner}/${repo!.repo}/readme`);
      if (r.status !== 200 || !r.body?.content) return null;
      return Buffer.from(r.body.content, "base64").toString("utf8");
    });
  const packageJson = () =>
    once("pkg", async () => {
      const r = await ghJson(`/repos/${repo!.owner}/${repo!.repo}/contents/package.json`);
      if (r.status !== 200 || !r.body?.content) return null;
      return Buffer.from(r.body.content, "base64").toString("utf8");
    });

  const noRepo: CheckResult = {
    status: "unknown",
    evidence: links.repoUrl ? "Not a GitHub repo link" : "Add your repo link",
  };

  const unreadable: CheckResult = { status: "fail", evidence: "Repo is private or doesn't exist" };
  /** README and package.json checks can't tell "missing" from "can't see it" without this. */
  const repoHidden = async () => (await repoInfo()).status === 404;

  async function run(kind: CheckKind, param: string | null, label = ""): Promise<CheckResult> {
    switch (kind) {
      case "manual":
        return { status: "unknown", evidence: "" };

      case "repo_public": {
        if (!repo) return noRepo;
        const r = await repoInfo();
        if (r.status === 200 && r.body?.private === false)
          return { status: "pass", evidence: `${repo.owner}/${repo.repo} is public` };
        if (r.status === 404)
          return { status: "fail", evidence: "Repo is private or doesn't exist" };
        return { status: "unknown", evidence: `GitHub answered ${r.status}` };
      }

      case "readme": {
        if (!repo) return noRepo;
        if (await repoHidden()) return unreadable;
        const text = await readme();
        if (text === null) return { status: "fail", evidence: "No README found" };
        const words = text.split(/\s+/).filter(Boolean).length;
        return words >= 50
          ? { status: "pass", evidence: `README, ${words} words` }
          : { status: "fail", evidence: `README is only ${words} words` };
      }

      case "license": {
        if (!repo) return noRepo;
        const r = await repoInfo();
        if (r.status === 404) return unreadable;
        if (r.status !== 200) return { status: "unknown", evidence: "Repo not readable" };
        const name = r.body?.license?.spdx_id ?? r.body?.license?.name;
        return name && name !== "NOASSERTION"
          ? { status: "pass", evidence: `${name} license` }
          : { status: "fail", evidence: "No license file" };
      }

      case "uses_tech": {
        if (!repo) return noRepo;
        const needle = (param ?? "").trim().toLowerCase();
        if (!needle) return { status: "unknown", evidence: "No technology named" };
        if (await repoHidden()) return unreadable;
        const [pkg, text] = await Promise.all([packageJson(), readme()]);
        if (pkg) {
          try {
            const parsed = JSON.parse(pkg);
            const deps = Object.keys({
              ...parsed.dependencies,
              ...parsed.devDependencies,
            });
            const hit = deps.find((d) => d.toLowerCase().includes(needle.replace(/\s+/g, "-")));
            if (hit) return { status: "pass", evidence: `${hit} in package.json` };
          } catch {
            // fall through to the README
          }
        }
        if (text && text.toLowerCase().includes(needle))
          return { status: "pass", evidence: "Named in the README" };
        return { status: "fail", evidence: `No sign of ${param} in package.json or README` };
      }

      case "demo_live": {
        if (!links.demoUrl) return { status: "unknown", evidence: "Add your demo link" };
        try {
          const url = await assertPublicUrlDns(links.demoUrl);
          // A rule that asks for a Clips recording isn't met by any other video.
          if ((param?.toLowerCase() === "clips" || /\bclips?\b/i.test(label)) && !isClipsLink(url))
            return { status: "fail", evidence: `Not a Clips link (${url.hostname})` };
          const res = await get(url.href, "text/html,*/*");
          return res.ok
            ? { status: "pass", evidence: `Opens publicly (${res.status})` }
            : { status: "fail", evidence: `Answered ${res.status}` };
        } catch (err) {
          return { status: "fail", evidence: err instanceof Error ? err.message : "Unreachable" };
        }
      }

      case "video_length": {
        if (!links.demoUrl) return { status: "unknown", evidence: "Add your demo link" };
        const max = Number(param);
        const seconds = await once("len", () => videoSeconds(links.demoUrl!));
        if (seconds === null)
          return { status: "unknown", evidence: "Length not readable from this link" };
        const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        if (!Number.isFinite(max) || max <= 0) return { status: "pass", evidence: mmss };
        return seconds <= max * 60
          ? { status: "pass", evidence: `${mmss}, limit ${max}:00` }
          : { status: "fail", evidence: `${mmss}, over the ${max}:00 limit` };
      }
    }
  }

  return {
    async check(kind: CheckKind, param: string | null, label?: string): Promise<CheckResult> {
      try {
        return await run(kind, param, label);
      } catch (err) {
        return {
          status: "unknown",
          evidence: err instanceof Error ? err.message.slice(0, 120) : "Check failed",
        };
      }
    },
  };
}

/** Hosted Clips (clips.agent-native.com) or a self-hosted Clips share link. */
function isClipsLink(url: URL) {
  const host = url.hostname.toLowerCase();
  if (host === "clips.agent-native.com" || host.endsWith(".clips.agent-native.com")) return true;
  return host.includes("clips") && url.pathname.startsWith("/share/");
}

/** Video length in seconds from the page's own metadata, or null. */
async function videoSeconds(demoUrl: string): Promise<number | null> {
  const url = await assertPublicUrlDns(demoUrl);
  const res = await get(url.href, "text/html,*/*");
  if (!res.ok) return null;
  const html = (await res.text()).slice(0, 2_000_000);
  // YouTube embeds lengthSeconds; most players publish og:video:duration or
  // schema.org duration (ISO 8601, e.g. PT2M41S).
  const yt = /"lengthSeconds":"(\d+)"/.exec(html);
  if (yt) return Number(yt[1]);
  const og = /<meta[^>]+property=["'](?:og:)?video:duration["'][^>]+content=["'](\d+)["']/i.exec(html);
  if (og) return Number(og[1]);
  const iso = /"duration"\s*:\s*"P(?:T)?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?"/.exec(html);
  if (iso && (iso[1] || iso[2] || iso[3]))
    return Math.round(Number(iso[1] ?? 0) * 3600 + Number(iso[2] ?? 0) * 60 + Number(iso[3] ?? 0));
  return null;
}
