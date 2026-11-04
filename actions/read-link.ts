import { defineAction, defineActionErrors } from "@agent-native/core/action";
import { z } from "zod";

import { ReadError, readLink } from "../server/lib/reader.js";

const errors = defineActionErrors("invalid_url", "blocked_host", "fetch_failed", "empty");

export default defineAction({
  description:
    "Read any public link and return clean Markdown: web pages (including JavaScript-rendered ones like Devpost, Luma, Notion), PDFs, X/Twitter posts, GitHub repos, plain text and JSON. Also returns the page's links so you can follow a rules or FAQ page. Use it whenever the user shares a URL.",
  schema: z.object({
    url: z.string().url().describe("Absolute http(s) URL to read"),
    render: z
      .enum(["auto", "always", "never"])
      .default("auto")
      .describe(
        '"auto" (default) renders JavaScript only when the plain read comes back empty or blocked; "always" forces a rendered read; "never" skips it',
      ),
  }),
  outputSchema: z.object({
    url: z.string(),
    finalUrl: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    method: z.enum(["x-post", "github-repo", "pdf", "html", "text", "rendered"]),
    markdown: z.string(),
    links: z.array(z.object({ text: z.string(), url: z.string() })),
    truncated: z.boolean(),
  }),
  errors,
  http: { method: "GET" },
  readOnly: true,
  run: async ({ url, render }) => {
    try {
      return await readLink(url, { render });
    } catch (error) {
      if (error instanceof ReadError) {
        errors.fail(error.message, error.code, {
          statusCode: error.code === "fetch_failed" ? 502 : 400,
        });
      }
      throw error;
    }
  },
});

