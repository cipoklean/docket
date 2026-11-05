import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";

import { askCourtAgent, Countdown, localDeadline } from "@/lib/court";
import { cn } from "@/lib/utils";

const usd = (n: number, compact = true) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n);

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
    void askCourtAgent(t("court.importPrompt", { url: target }), undefined, {
      openSidebar: false,
    }).then((delivered) => {
      if (!delivered) setPending((p) => (p ? { ...p, failed: true } : p));
    });
    setUrl("");
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
      <form onSubmit={importHackathon} noValidate>
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
        {data?.hackathons.map((h) => {
          const clash = h.clashesWith.length > 0;
          const hoursLeft = (Date.parse(h.deadlineAt) - Date.now()) / 3_600_000;
          const urgent = h.open && hoursLeft < 24;
          return (
            <li key={h.id}>
              <Link
                to={`/court/${encodeURIComponent(h.id)}`}
                className={cn(
                  "-mx-3 flex items-baseline gap-4 rounded-md border-l-2 px-3 py-3 hover:bg-accent",
                  clash ? "border-amber-500" : "border-transparent",
                  !h.open && "text-muted-foreground",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                {h.score !== null ? (
                  <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    {Math.round(h.score)}
                    <span className="text-xs">/100</span>
                  </span>
                ) : null}
                {h.prizeUsd ? (
                  <span
                    className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground"
                    title={
                      h.open && hoursLeft > 0
                        ? t("court.prizePerHour", {
                            amount: usd(h.prizeUsd / hoursLeft, false),
                          })
                        : undefined
                    }
                  >
                    {usd(h.prizeUsd)}
                  </span>
                ) : null}
                <Countdown
                  deadlineAt={h.deadlineAt}
                  className={clash && !urgent ? "text-amber-500" : undefined}
                  title={
                    clash
                      ? t("court.clash", {
                          deadline: localDeadline(h.deadlineAt),
                          names: h.clashesWith.join(", "),
                        })
                      : undefined
                  }
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
