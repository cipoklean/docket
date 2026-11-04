import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { askCourtAgent, Countdown } from "@/lib/court";

export default function CourtIndexRoute() {
  const t = useT();
  const [url, setUrl] = useState("");
  const navigate = useNavigate();
  const { data } = useActionQuery("list-hackathons", {});
  const ids = data?.hackathons.map((h) => h.id) ?? [];
  // An import runs in the background; its row stays here until the board exists.
  const [pending, setPending] = useState<{
    host: string;
    known: string[];
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!pending || pending.failed) return;
    const fresh = data?.hackathons.find((h) => !pending.known.includes(h.id));
    if (fresh) {
      setPending(null);
      navigate(`/court/${encodeURIComponent(fresh.id)}`);
      return;
    }
    const timer = window.setTimeout(
      () => setPending((p) => (p ? { ...p, failed: true } : p)),
      5 * 60_000,
    );
    return () => window.clearTimeout(timer);
  }, [data, pending, navigate]);

  function importHackathon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = url.trim();
    if (!target) return;
    let host = target;
    try {
      host = new URL(target).hostname.replace(/^www\./, "");
    } catch {}
    setPending({ host, known: ids, failed: false });
    askCourtAgent(t("court.importPrompt", { url: target }), undefined, {
      openSidebar: false,
    });
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
        {pending ? (
          <li
            aria-live="polite"
            className={
              pending.failed
                ? "-mx-3 px-3 py-3 text-destructive"
                : "-mx-3 animate-pulse px-3 py-3 text-muted-foreground"
            }
          >
            {pending.failed
              ? t("court.importFailed", { host: pending.host })
              : t("court.importing", { host: pending.host })}
          </li>
        ) : null}
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
