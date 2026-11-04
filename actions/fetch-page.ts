import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

const MAX_CHARS = 40_000;

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export default defineAction({
  description:
    "Fetch a public web page (hackathon page, rules, FAQ) and return its readable text, truncated to 40,000 characters. Use before create-hackathon to read the real rules, deadline and rubric.",
  schema: z.object({
    url: z.string().url().describe("Absolute http(s) URL of the page to read"),
  }),
  outputSchema: z.object({
    url: z.string(),
    title: z.string().nullable(),
    text: z.string(),
    truncated: z.boolean(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ url }) => {
    if (!/^https?:\/\//i.test(url)) {
      fail("Only http(s) URLs can be fetched.", { errorCode: "invalid_url" });
    }
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "user-agent": "ShipCourt/0.1 (+hackathon copilot)" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      fail(`Could not reach ${url}.`, {
        errorCode: "fetch_failed",
        statusCode: 502,
      });
    }
    if (!res.ok) {
      fail(`${url} answered ${res.status}.`, {
        errorCode: "fetch_failed",
        statusCode: 502,
      });
    }
    const html = await res.text();
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
    const text = htmlToText(html);
    return {
      url,
      title,
      text: text.slice(0, MAX_CHARS),
      truncated: text.length > MAX_CHARS,
    };
  },
});
