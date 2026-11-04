import { sendToAgentChat } from "@agent-native/core/client/agent-chat";

/** Hand an AI-shaped job (import, scoring, court, drafting) to the agent sidebar. */
export function askCourtAgent(message: string, context?: string) {
  sendToAgentChat({
    message,
    ...(context ? { context } : {}),
    submit: true,
    openSidebar: true,
  });
}

export function formatCountdown(deadlineAt: string, now: number) {
  const ms = Date.parse(deadlineAt) - now;
  if (ms <= 0) return null;
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return { d, h, m, urgent: ms < 24 * 3_600_000 };
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
