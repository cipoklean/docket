import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { IconCheck } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { askCourtAgent, Countdown } from "@/lib/court";
import { cn } from "@/lib/utils";

type Verdict = "ship" | "fake" | "cut";
type Task = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  criterionId: string | null;
  verdict: Verdict | null;
  recommendedVerdict: Verdict | null;
  courtArgument: string | null;
  points: number | null;
};

const VERDICTS: Verdict[] = ["ship", "fake", "cut"];

/** Open tasks first, cut ones sink, done ones last. */
function rank(task: Task) {
  if (task.status === "done") return 2;
  return task.verdict === "cut" ? 1 : 0;
}

export default function HackathonRoute() {
  const t = useT();
  const { hackathonId = "" } = useParams();
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ id: hackathonId }), [hackathonId]);
  const queryKey = ["action", "get-hackathon", params];
  const { data: h, isPending } = useActionQuery("get-hackathon", params);
  const [newTask, setNewTask] = useState("");
  // Review/Judge run in the background; the button shows it until the board changes.
  const [busy, setBusy] = useState<{ kind: "review" | "judge"; sig: string } | null>(null);
  const sig = h
    ? JSON.stringify([
        h.criteria.map((c) => [c.score, c.rationale]),
        h.tasks.map((task) => [task.id, task.recommendedVerdict, task.points]),
      ])
    : "";
  // A ref, not state: a fast double tap lands before the button re-renders disabled.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy !== null;
    if (busy && sig !== busy.sig) setBusy(null);
  }, [busy, sig]);
  // The run can end without changing the board (same scores again); stop waiting then too.
  useEffect(() => {
    const onRunning = (event: Event) => {
      if ((event as CustomEvent<{ isRunning?: boolean }>).detail?.isRunning !== false) return;
      setBusy(null);
      queryClient.invalidateQueries({ queryKey: ["action", "get-hackathon"] });
    };
    window.addEventListener("agentNative.chatRunning", onRunning);
    return () => window.removeEventListener("agentNative.chatRunning", onRunning);
  }, [queryClient]);
  useEffect(() => {
    if (!busy) return;
    const timer = window.setTimeout(() => {
      setBusy(null);
      toast(t("court.agentSlow"));
    }, 240_000);
    return () => window.clearTimeout(timer);
  }, [busy, t]);

  const onError = (err: unknown) =>
    toast.error(actionErrorMessage(err) ?? t("court.saveFailed"));

  const patchTask = useActionMutation("update-task", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: typeof h) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((task) =>
                task.id === input.id ? { ...task, ...input } : task,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (err, _input, context) => {
      queryClient.setQueryData(
        queryKey,
        (context as { previous?: unknown } | undefined)?.previous,
      );
      onError(err);
    },
  });
  const addTasks = useActionMutation("add-tasks", {
    onSuccess: () => setNewTask(""),
    onError,
  });

  if (isPending) return null;
  if (!h) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-muted-foreground">
        {t("court.notFound")}
      </main>
    );
  }

  const context = `Hackathon id: ${h.id} ("${h.name}"). Call get-hackathon first.`;
  const groups = [
    { id: null as string | null, name: null as string | null, weight: null as number | null, score: null as number | null, rationale: null as string | null },
    ...h.criteria,
  ]
    .map((c) => ({
      ...c,
      tasks: (h.tasks as Task[])
        .filter((task) => task.points === null && task.criterionId === c.id)
        .sort((a, b) => rank(a) - rank(b)),
    }))
    .filter((g) => g.id !== null || g.tasks.length);
  // Judge-pass fixes sit above everything, worth-most first.
  const fixes = (h.tasks as Task[])
    .filter((task) => task.points !== null)
    .sort((a, b) => rank(a) - rank(b) || (b.points ?? 0) - (a.points ?? 0));
  const fixGain = fixes
    .filter((f) => f.status !== "done" && f.verdict !== "cut")
    .reduce((n, f) => n + (f.points ?? 0), 0);

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.trim();
    if (title) addTasks.mutate({ hackathonId: h!.id, tasks: [{ title }] });
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <header className="flex items-center gap-3">
        <h1 className="line-clamp-2 min-w-0 flex-1 break-words text-xl font-semibold tracking-tight">
          {h.url ? (
            <a href={h.url} target="_blank" rel="noreferrer" className="hover:underline">
              {h.name}
            </a>
          ) : (
            h.name
          )}
        </h1>
        <Countdown deadlineAt={h.deadlineAt} className="shrink-0 text-sm" />
      </header>

      <Tabs defaultValue="tasks" className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="tasks">{t("court.tabTasks")}</TabsTrigger>
            <TabsTrigger value="checks">
              {t("court.tabChecks")}
              {h.checks.length ? (
                <span className="ms-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                  {h.checks.filter((c) => c.status === "pass").length}/{h.checks.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="submission">{t("court.tabSubmission")}</TabsTrigger>
          </TabsList>
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {h.score ?? "–"}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </span>
        </div>

        <TabsContent value="tasks" className="mt-6">
          <div className="flex justify-end gap-2">
            {(["review", "judge"] as const).map((kind) => (
              <Button
                key={kind}
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => {
                  if (busyRef.current) return;
                  busyRef.current = true;
                  setBusy({ kind, sig });
                  askCourtAgent(t(`court.${kind}Prompt`), context, { openSidebar: false });
                }}
              >
                {busy?.kind === kind ? t(`court.${kind === "judge" ? "judging" : "reviewing"}`) : t(`court.${kind}`)}
              </Button>
            ))}
          </div>

          {fixes.length ? (
            <section className="mt-6">
              <h2 className="flex items-baseline gap-2 border-b border-border pb-2 text-sm font-medium">
                <span className="flex-1">{t("court.fixes")}</span>
                {fixGain ? (
                  <span className="font-mono tabular-nums">+{fixGain}</span>
                ) : null}
              </h2>
              <ul>
                {fixes.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onPatch={(patch) => patchTask.mutate({ id: task.id, ...patch })}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {groups.map((g) => (
            <section key={g.id ?? "none"} className="mt-6">
              <h2
                title={g.rationale ?? undefined}
                className="flex items-baseline gap-2 border-b border-border pb-2 text-sm font-medium"
              >
                <span className="flex-1 truncate">{g.name ?? t("court.other")}</span>
                {g.weight !== null ? (
                  <>
                    <span className="font-mono tabular-nums">{g.score ?? "–"}/10</span>
                    <span className="w-10 text-right font-mono text-muted-foreground tabular-nums">
                      {g.weight}%
                    </span>
                  </>
                ) : null}
              </h2>
              <ul>
                {g.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onPatch={(patch) => patchTask.mutate({ id: task.id, ...patch })}
                  />
                ))}
              </ul>
            </section>
          ))}

          <form onSubmit={addTask} className="mt-6">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder={t("court.newTask")}
              aria-label={t("court.newTask")}
              maxLength={200}
              className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </form>
        </TabsContent>

        <TabsContent value="checks" className="mt-6">
          <Checks
            hackathon={h}
            onFindRules={() => askCourtAgent(t("court.rulesPrompt"), context)}
            onError={onError}
          />
        </TabsContent>

        <TabsContent value="submission" className="mt-6">
          <Submission
            id={h.id}
            draft={h.submissionDraft ?? ""}
            script={h.demoScript ?? ""}
            onDraft={() => askCourtAgent(t("court.draftPrompt"), context)}
            onError={onError}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function TaskRow({
  task,
  onPatch,
}: {
  task: Task;
  onPatch: (patch: Partial<Pick<Task, "status" | "verdict">>) => void;
}) {
  const t = useT();
  const done = task.status === "done";
  const cut = !done && task.verdict === "cut";
  return (
    <li className="group flex items-center gap-3 border-b border-border/60 py-2.5">
      <button
        type="button"
        aria-label={t(done ? "court.markOpen" : "court.markDone")}
        onClick={() => onPatch({ status: done ? "todo" : "done" })}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          done ? "border-foreground bg-foreground text-background" : "border-muted-foreground",
        )}
      >
        {done ? <IconCheck className="size-3" stroke={3} /> : null}
      </button>
      <span
        className={cn(
          "min-w-0 flex-1 text-sm",
          (done || cut) && "text-muted-foreground",
          cut && "line-through",
        )}
      >
        {task.title}
      </span>
      {task.points !== null ? (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          +{task.points}
        </span>
      ) : null}
      {!done ? (
        <span className="flex shrink-0 gap-1" title={task.courtArgument ?? undefined}>
          {VERDICTS.map((v) => {
            const ruled = task.verdict === v;
            const suggested = !task.verdict && task.recommendedVerdict === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={ruled}
                onClick={() => onPatch({ verdict: ruled ? null : v })}
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs transition-opacity",
                  ruled
                    ? "bg-foreground text-background"
                    : suggested
                      ? "ring-1 ring-foreground/60"
                      : "text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
                )}
              >
                {t(`court.verdict_${v}`)}
              </button>
            );
          })}
        </span>
      ) : null}
    </li>
  );
}

/** Two plain fields that save themselves when you leave them. */
function Submission({
  id,
  draft,
  script,
  onDraft,
  onError,
}: {
  id: string;
  draft: string;
  script: string;
  onDraft: () => void;
  onError: (err: unknown) => void;
}) {
  const t = useT();
  const save = useActionMutation("update-hackathon", { onError });
  const [values, setValues] = useState({ submissionDraft: draft, demoScript: script });
  useEffect(() => setValues({ submissionDraft: draft, demoScript: script }), [draft, script]);

  const fields = [
    { key: "submissionDraft", label: t("court.description"), saved: draft },
    { key: "demoScript", label: t("court.demoScript"), saved: script },
  ] as const;

  return (
    <div className="grid gap-8">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onDraft}>
          {t("court.draft")}
        </Button>
      </div>
      {fields.map((f) => (
        <label key={f.key} className="grid gap-2">
          <span className="text-sm font-medium">{f.label}</span>
          <textarea
            value={values[f.key]}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            onBlur={() => {
              if (values[f.key] !== f.saved) save.mutate({ id, [f.key]: values[f.key] });
            }}
            rows={12}
            className="w-full resize-y bg-transparent text-sm leading-relaxed outline-none"
          />
        </label>
      ))}
    </div>
  );
}

type Check = {
  id: string;
  label: string;
  kind: string;
  status: "unknown" | "pass" | "fail";
  evidence: string | null;
};

/**
 * The hackathon's rules as checks, verified against the real repo and demo.
 * Automatic checks only turn green from verify-checks; manual ones are ticked.
 */
function Checks({
  hackathon,
  onFindRules,
  onError,
}: {
  hackathon: {
    id: string;
    repoUrl: string | null;
    demoUrl: string | null;
    checks: Check[];
  };
  onFindRules: () => void;
  onError: (err: unknown) => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["action", "get-hackathon"] });
  const save = useActionMutation("update-hackathon", { onError, onSuccess: refresh });
  const verify = useActionMutation("verify-checks", { onError, onSuccess: refresh });
  const tick = useActionMutation("update-check", { onError, onSuccess: refresh });
  const [links, setLinks] = useState({
    repoUrl: hackathon.repoUrl ?? "",
    demoUrl: hackathon.demoUrl ?? "",
  });
  useEffect(
    () => setLinks({ repoUrl: hackathon.repoUrl ?? "", demoUrl: hackathon.demoUrl ?? "" }),
    [hackathon.repoUrl, hackathon.demoUrl],
  );

  const fields = [
    { key: "repoUrl", label: t("court.repoUrl"), saved: hackathon.repoUrl ?? "" },
    { key: "demoUrl", label: t("court.demoUrl"), saved: hackathon.demoUrl ?? "" },
  ] as const;

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        {fields.map((f) => (
          <input
            key={f.key}
            type="url"
            value={links[f.key]}
            placeholder={f.label}
            aria-label={f.label}
            onChange={(e) => setLinks((v) => ({ ...v, [f.key]: e.target.value }))}
            onBlur={(e) => {
              // Tapping Check saves the links itself; saving here too would race it.
              if ((e.relatedTarget as HTMLElement | null)?.dataset.verify) return;
              if (links[f.key].trim() !== f.saved)
                save.mutate({ id: hackathon.id, [f.key]: links[f.key].trim() });
            }}
            className="w-full border-b border-border bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground"
          />
        ))}
      </div>

      <div className="flex justify-end">
        {hackathon.checks.length ? (
          <Button
            size="sm"
            variant="outline"
            data-verify="true"
            disabled={verify.isPending}
            onClick={() =>
              verify.mutate({
                hackathonId: hackathon.id,
                repoUrl: links.repoUrl,
                demoUrl: links.demoUrl,
              })
            }
          >
            {verify.isPending ? t("court.checking") : t("court.check")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onFindRules}>
            {t("court.findRules")}
          </Button>
        )}
      </div>

      <ul>
        {hackathon.checks.map((c) => {
          const manual = c.kind === "manual";
          const dot = (
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-full border",
                c.status === "pass" && "border-foreground bg-foreground text-background",
                c.status === "fail" && "border-destructive bg-destructive",
                c.status === "unknown" && "border-muted-foreground",
              )}
            >
              {c.status === "pass" ? <IconCheck className="size-3" stroke={3} /> : null}
            </span>
          );
          return (
            <li key={c.id} className="flex items-center gap-3 border-b border-border/60 py-2.5">
              {manual ? (
                <button
                  type="button"
                  aria-label={t(c.status === "pass" ? "court.markOpen" : "court.markDone")}
                  onClick={() =>
                    tick.mutate({
                      hackathonId: hackathon.id,
                      id: c.id,
                      done: c.status !== "pass",
                    })
                  }
                >
                  {dot}
                </button>
              ) : (
                dot
              )}
              <span className="min-w-0 flex-1 text-sm">{c.label}</span>
              {c.evidence ? (
                <span
                  className={cn(
                    "max-w-[50%] truncate text-right text-xs",
                    c.status === "fail" ? "text-destructive" : "text-muted-foreground",
                  )}
                  title={c.evidence}
                >
                  {c.evidence}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
