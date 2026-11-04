/**
 * Universal link reader: turns almost any public URL into clean Markdown.
 *
 * Strategy chain (first good result wins):
 *  1. Site adapters: X/Twitter posts (fxtwitter API), GitHub repos (README via API).
 *  2. Direct fetch, branched by content type:
 *     - PDF  -> text via unpdf
 *     - HTML -> Mozilla Readability + Turndown, plus title/description/JSON-LD,
 *               and Next.js __NEXT_DATA__ text for client-rendered pages
 *     - JSON / plain text / Markdown -> as is
 *  3. Rendered fallback: when the page is blocked, empty, or a JS shell, read it
 *     through a headless renderer (r.jina.ai) that executes JavaScript.
 */
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

export const MAX_CHARS = 60_000;
const MIN_USEFUL_CHARS = 600;
const TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export type ReadMethod =
  | "x-post"
  | "github-repo"
  | "pdf"
  | "html"
  | "text"
  | "rendered";

export interface ReadResult {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  method: ReadMethod;
  markdown: string;
  links: { text: string; url: string }[];
  truncated: boolean;
}

export class ReadError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_url" | "blocked_host" | "fetch_failed" | "empty",
  ) {
    super(message);
  }
}

function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ReadError("That isn't a valid URL.", "invalid_url");
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new ReadError("Only http(s) links can be read.", "invalid_url");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "[::1]" ||
    host === "metadata.google.internal"
  ) {
    throw new ReadError("Private and local addresses can't be read.", "blocked_host");
  }
  return url;
}

async function get(url: string, accept = "*/*") {
  return fetch(url, {
    redirect: "follow",
    headers: { "user-agent": UA, accept, "accept-language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function clip(markdown: string) {
  const clean = markdown.replace(/\n{3,}/g, "\n\n").trim();
  return {
    markdown: clean.slice(0, MAX_CHARS),
    truncated: clean.length > MAX_CHARS,
  };
}

// ---------- site adapters ----------

async function readXPost(url: URL): Promise<ReadResult | null> {
  if (!/^(www\.|mobile\.)?(x|twitter)\.com$/.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/([^/]+)\/status(?:es)?\/(\d+)/);
  if (!m) return null;
  const res = await get(`https://api.fxtwitter.com/${m[1]}/status/${m[2]}`, "application/json");
  if (!res.ok) return null;
  const data = (await res.json()) as {
    tweet?: {
      text?: string;
      created_at?: string;
      author?: { name?: string; screen_name?: string };
      likes?: number;
      retweets?: number;
      replies?: number;
      quote?: { text?: string; author?: { screen_name?: string } };
      media?: { all?: { url?: string; type?: string }[] };
    };
  };
  const t = data.tweet;
  if (!t?.text) return null;
  const parts = [
    `**${t.author?.name ?? ""} (@${t.author?.screen_name ?? m[1]})**, ${t.created_at ?? ""}`,
    "",
    t.text,
  ];
  if (t.quote?.text) parts.push("", `> Quoting @${t.quote.author?.screen_name ?? ""}: ${t.quote.text}`);
  const media = t.media?.all?.map((x) => x.url).filter(Boolean) ?? [];
  if (media.length) parts.push("", "Media: " + media.join(", "));
  parts.push("", `${t.likes ?? 0} likes · ${t.retweets ?? 0} reposts · ${t.replies ?? 0} replies`);
  return {
    url: url.href,
    finalUrl: url.href,
    title: `Post by @${t.author?.screen_name ?? m[1]}`,
    description: null,
    method: "x-post",
    links: [],
    ...clip(parts.join("\n")),
  };
}

async function readGitHubRepo(url: URL): Promise<ReadResult | null> {
  if (url.hostname !== "github.com") return null;
  const m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/);
  if (!m) return null;
  const [owner, repo] = [m[1], (m[2] ?? "").replace(/\.git$/, "")];
  const [metaRes, readmeRes] = await Promise.all([
    get(`https://api.github.com/repos/${owner}/${repo}`, "application/vnd.github+json"),
    get(`https://api.github.com/repos/${owner}/${repo}/readme`, "application/vnd.github.raw"),
  ]);
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as {
    full_name?: string;
    description?: string | null;
    stargazers_count?: number;
    language?: string | null;
    pushed_at?: string;
    homepage?: string | null;
  };
  const readme = readmeRes.ok ? await readmeRes.text() : "";
  const header = [
    `# ${meta.full_name ?? `${owner}/${repo}`}`,
    meta.description ?? "",
    `Stars: ${meta.stargazers_count ?? 0} · Language: ${meta.language ?? "n/a"} · Last push: ${meta.pushed_at ?? "n/a"}${meta.homepage ? ` · Site: ${meta.homepage}` : ""}`,
    "",
  ].join("\n");
  return {
    url: url.href,
    finalUrl: url.href,
    title: meta.full_name ?? `${owner}/${repo}`,
    description: meta.description ?? null,
    method: "github-repo",
    links: [],
    ...clip(header + readme),
  };
}

// ---------- generic ----------

async function readPdf(bytes: ArrayBuffer, url: string): Promise<ReadResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const markdown = pages
    .map((p, i) => `<!-- page ${i + 1} -->\n${p.trim()}`)
    .join("\n\n");
  return {
    url,
    finalUrl: url,
    title: null,
    description: null,
    method: "pdf",
    links: [],
    ...clip(markdown),
  };
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});
turndown.remove(["script", "style", "noscript", "iframe", "form"]);
turndown.remove((node) => node.nodeName.toLowerCase() === "svg");

function textFromNextData(html: string): string {
  const raw = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  )?.[1];
  if (!raw) return "";
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || out.length > 4000) return;
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 40 && /\s/.test(s) && !/^https?:\/\//.test(s)) out.push(s);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (v && typeof v === "object")
      Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  try {
    walk(JSON.parse(raw), 0);
  } catch {
    return "";
  }
  return [...new Set(out)].join("\n\n");
}

function jsonLdSummary(document: Document): string {
  const blocks: string[] = [];
  document
    .querySelectorAll('script[type="application/ld+json"]')
    .forEach((el) => {
      try {
        const data = JSON.parse(el.textContent ?? "");
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const type = item?.["@type"];
          if (!type) continue;
          const bits = [
            `Type: ${Array.isArray(type) ? type.join(", ") : type}`,
            item.name && `Name: ${item.name}`,
            item.startDate && `Starts: ${item.startDate}`,
            item.endDate && `Ends: ${item.endDate}`,
            item.location?.name && `Location: ${item.location.name}`,
            item.offers?.price && `Price: ${item.offers.price} ${item.offers.priceCurrency ?? ""}`,
          ].filter(Boolean);
          if (bits.length > 1) blocks.push(bits.join(" · "));
        }
      } catch {
        // ignore malformed JSON-LD
      }
    });
  return blocks.join("\n");
}

function readHtml(html: string, finalUrl: string): ReadResult {
  const { document } = parseHTML(html);
  const meta = (sel: string) =>
    document.querySelector(sel)?.getAttribute("content")?.trim() || null;
  const title =
    meta('meta[property="og:title"]') ??
    document.querySelector("title")?.textContent?.trim() ??
    null;
  const description =
    meta('meta[name="description"]') ?? meta('meta[property="og:description"]');

  const links: { text: string; url: string }[] = [];
  const seen = new Set<string>();
  document.querySelectorAll("a[href]").forEach((a) => {
    if (links.length >= 80) return;
    const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
    try {
      const href = new URL(a.getAttribute("href") ?? "", finalUrl).href;
      if (text && /^https?:/.test(href) && !seen.has(href)) {
        seen.add(href);
        links.push({ text: text.slice(0, 80), url: href });
      }
    } catch {
      // skip unparsable href
    }
  });

  const ld = jsonLdSummary(document as unknown as Document);
  const article = new Readability(document as unknown as Document, {
    charThreshold: 200,
  }).parse();
  let body = article?.content ? turndown.turndown(article.content) : "";
  if (body.length < MIN_USEFUL_CHARS) {
    const bodyEl = parseHTML(html).document.querySelector("body");
    const full = bodyEl ? turndown.turndown(bodyEl.innerHTML ?? "") : "";
    if (full.length > body.length) body = full;
  }
  if (body.length < MIN_USEFUL_CHARS) {
    const next = textFromNextData(html);
    if (next.length > body.length) body = next;
  }
  const head = [description && `> ${description}`, ld].filter(Boolean).join("\n\n");
  return {
    url: finalUrl,
    finalUrl,
    title,
    description,
    method: "html",
    links,
    ...clip([head, body].filter(Boolean).join("\n\n")),
  };
}

async function readRendered(url: string): Promise<ReadResult | null> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { accept: "text/plain", "x-return-format": "markdown" },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  const title = text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const body = text.split(/^Markdown Content:\s*$/m)[1] ?? text;
  if (body.trim().length < 50) return null;
  return {
    url,
    finalUrl: url,
    title,
    description: null,
    method: "rendered",
    links: [],
    ...clip(body),
  };
}

function looksLikeJsShell(r: ReadResult) {
  return (
    r.markdown.length < MIN_USEFUL_CHARS ||
    /enable javascript|you need to enable|checking your browser|just a moment|access denied|captcha/i.test(
      r.markdown.slice(0, 2000),
    )
  );
}

export async function readLink(
  rawUrl: string,
  opts: { render?: "auto" | "always" | "never" } = {},
): Promise<ReadResult> {
  const url = assertPublicUrl(rawUrl);
  const render = opts.render ?? "auto";

  if (render !== "always") {
    for (const adapter of [readXPost, readGitHubRepo]) {
      try {
        const hit = await adapter(url);
        if (hit) return hit;
      } catch {
        // fall through to the generic reader
      }
    }
  }

  let direct: ReadResult | null = null;
  let directError = "";
  if (render !== "always") {
    try {
      const res = await get(url.href, "text/html,application/xhtml+xml,application/pdf,*/*;q=0.8");
      const finalUrl = res.url || url.href;
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        directError = `answered ${res.status}`;
      } else if (type.includes("pdf") || /\.pdf($|\?)/i.test(finalUrl)) {
        return await readPdf(await res.arrayBuffer(), finalUrl);
      } else if (type.includes("html") || type === "") {
        direct = readHtml(await res.text(), finalUrl);
      } else if (/json|text|markdown|xml/.test(type)) {
        const text = await res.text();
        return {
          url: url.href,
          finalUrl,
          title: null,
          description: null,
          method: "text",
          links: [],
          ...clip(text),
        };
      } else {
        directError = `is a ${type} file, which can't be read as text`;
      }
    } catch (error) {
      directError = error instanceof Error ? error.message : "could not be reached";
    }
  }

  if (direct && (render === "never" || !looksLikeJsShell(direct))) return direct;

  if (render !== "never") {
    try {
      const rendered = await readRendered(url.href);
      if (rendered && (!direct || rendered.markdown.length > direct.markdown.length)) {
        return {
          ...rendered,
          title: rendered.title ?? direct?.title ?? null,
          description: direct?.description ?? null,
          links: direct?.links ?? [],
        };
      }
    } catch {
      // keep whatever the direct read produced
    }
  }

  if (direct) return direct;
  throw new ReadError(`${url.href} ${directError || "returned nothing readable"}.`, "fetch_failed");
}
