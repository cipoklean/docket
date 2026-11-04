import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useState } from "react";
import { Link } from "react-router";

import { askCourtAgent, Countdown } from "@/lib/court";

export default function CourtIndexRoute() {
  const t = useT();
  const [url, setUrl] = useState("");
  const { data } = useActionQuery("list-hackathons", {});

  function importHackathon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = url.trim();
    if (!target) return;
    askCourtAgent(t("court.importPrompt", { url: target }));
    setUrl("");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <form onSubmit={importHackathon}>
        <input
          type="url"
          required
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("court.importPlaceholder")}
          aria-label={t("court.importPlaceholder")}
          className="w-full border-b border-border bg-transparent pb-3 text-lg outline-none placeholder:text-muted-foreground focus:border-foreground"
        />
      </form>

      <ul className="mt-8">
        {data?.hackathons.map((h) => (
          <li key={h.id}>
            <Link
              to={`/court/${encodeURIComponent(h.id)}`}
              className="-mx-3 flex items-baseline justify-between gap-4 rounded-md px-3 py-3 hover:bg-accent"
            >
              <span className="truncate">{h.name}</span>
              <Countdown deadlineAt={h.deadlineAt} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
