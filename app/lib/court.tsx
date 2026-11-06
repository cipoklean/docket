import { sendToAgentChatAndConfirm } from "@agent-native/core/client/agent-chat";
import { ensureAgentEngineReadiness } from "@agent-native/core/client/agent-engine-readiness";
import { openSettingsPage } from "@agent-native/core/client/navigation";
import { useAgentEngineConfigured } from "@agent-native/core/client/use-agent-engine-configured";
import { useT } from "@agent-native/core/client/i18n";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/** Hand an AI-shaped job (import, review, drafting) to the agent sidebar. */
/**
 * Send a prompt to the agent. The chat drops a submit that no composer claims
 * within a few seconds (a slow first load), so retry until one confirms it.
 * Resolves false when the agent never received it.
 */
export async function askCourtAgent(
  message: string,
  context?: string,
  { openSidebar = true }: { openSidebar?: boolean } = {},
): Promise<boolean> {
  // No model connected: send the user to connect one instead of failing quietly.
  const ready = await ensureAgentEngineReadiness({ timeoutMs: 8000 }).catch(
    () => "unknown" as const,
  );
  if (ready === "missing") {
    openSettingsPage("model");
    return false;
  }
  // One id for every attempt, so a retry never posts the prompt twice.
  const submitMessageId = crypto.randomUUID();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { delivered } = await sendToAgentChatAndConfirm(
      {
        message,
        ...(context ? { context } : {}),
        submit: true,
        openSidebar,
        chatTarget: "local",
      },
      { submitMessageId, timeoutMs: 10_000 },
    );
    if (delivered) return true;
    await new Promise((r) => window.setTimeout(r, 2000));
  }
  return false;
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function localDeadline(deadlineAt: string) {
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
  title,
}: {
  deadlineAt: string;
  className?: string | undefined;
  /** Replaces the default tooltip (the local deadline). */
  title?: string | undefined;
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
      title={title ?? localDeadline(deadlineAt)}
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

/** One row, shown only while the signed-in user has no model connected. */
export function ModelGate() {
  const t = useT();
  const { missing } = useAgentEngineConfigured();
  if (!missing) return null;
  return (
    <div
      role="status"
      title={t("court.noModelHint")}
      className="mx-auto flex w-full max-w-2xl items-center justify-between gap-4 px-4 pt-6"
    >
      <span className="text-muted-foreground">{t("court.noModel")}</span>
      <button
        type="button"
        onClick={() => openSettingsPage("model")}
        className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm text-background hover:opacity-90"
      >
        {t("court.connectModel")}
      </button>
    </div>
  );
}
