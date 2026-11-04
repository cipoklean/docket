import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Hand an AI-shaped job (import, review, drafting) to the agent sidebar. */
export function askCourtAgent(message: string, context?: string) {
  sendToAgentChat({
    message,
    ...(context ? { context } : {}),
    submit: true,
    openSidebar: true,
  });
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function localDeadline(deadlineAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(deadlineAt));
}

/** Time left to a deadline. Red under 24h; the exact deadline is its tooltip. */
export function Countdown({
  deadlineAt,
  className,
}: {
  deadlineAt: string;
  className?: string;
}) {
  const t = useT();
  const ms = Date.parse(deadlineAt) - useNow();
  const mins = Math.max(0, Math.floor(ms / 60_000));
  const text =
    ms > 0
      ? t("court.countdown", {
          d: Math.floor(mins / 1440),
          h: Math.floor((mins % 1440) / 60),
          m: mins % 60,
        })
      : t("court.closed");
  return (
    <time
      dateTime={deadlineAt}
      title={localDeadline(deadlineAt)}
      className={cn(
        "shrink-0 font-mono tabular-nums",
        ms > 0 && ms < 86_400_000 ? "text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      {text}
    </time>
  );
}
