import { useActionQuery } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { IconGavel, IconLink, IconPlus } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  askCourtAgent,
  formatCountdown,
  localDeadline,
} from "@/lib/court-agent";

export default function CourtIndexRoute() {
  const t = useT();
  const [url, setUrl] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const { data, isPending } = useActionQuery("list-hackathons", {});

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function importHackathon(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = url.trim();
    if (!target) return;
    askCourtAgent(
      t("court.importPrompt", { url: target }),
      "Ship Court import: read the page with read-link (and its rules page if linked), then create-hackathon with the real deadline, rubric weights, deliverables, and 6-10 starter tasks. Then navigate to the new board.",
    );
    setUrl("");
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <form
        onSubmit={importHackathon}
        className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <IconLink className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("court.importPlaceholder")}
            aria-label={t("court.importPlaceholder")}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={!url.trim()}>
          <IconPlus className="size-4" />
          {t("court.import")}
        </Button>
      </form>

      {isPending ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : data?.hackathons.length ? (
        <ul className="grid gap-3">
          {data.hackathons.map((h) => {
            const left = formatCountdown(h.deadlineAt, now);
            return (
              <li key={h.id}>
                <Link
                  to={`/court/${encodeURIComponent(h.id)}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0">
                    <strong className="block truncate font-semibold">
                      {h.name}
                    </strong>
                    <span className="text-sm text-muted-foreground">
                      {localDeadline(h.deadlineAt)}
                    </span>
                  </span>
                  <span
                    className={
                      left?.urgent
                        ? "shrink-0 font-mono text-sm font-semibold text-destructive"
                        : "shrink-0 font-mono text-sm text-muted-foreground"
                    }
                  >
                    {left
                      ? t("court.countdown", left)
                      : t("court.closed")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-10 text-center">
          <IconGavel className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("court.empty")}</p>
        </div>
      )}
    </main>
  );
}
