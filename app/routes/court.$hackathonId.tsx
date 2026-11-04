import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconArrowLeft,
  IconArrowRight,
  IconChecklist,
  IconExternalLink,
  IconGavel,
  IconPlus,
  IconScale,
  IconWriting,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  askCourtAgent,
  formatCountdown,
  localDeadline,
} from "@/lib/court-agent";
import { cn } from "@/lib/utils";

type Status = "todo" | "doing" | "done";
type Verdict = "ship" | "cut" | "fake";
type Task = {
  id: string;
  title: string;
  notes: string | null;
  status: Status;
  criterionId: string | null;
  verdict: Verdict | null;
  recommendedVerdict: Verdict | null;
  courtArgument: string | null;
  position: number;
};

const COLUMNS: Status[] = ["todo", "doing", "done"];
const VERDICTS: Verdict[] = ["ship", "fake", "cut"];

export default function HackathonBoardRoute() {
  const t = useT();
  const { hackathonId = "" } = useParams();
  const queryClient = useQueryClient();
  const params = useMemo(() => ({ id: hackathonId }), [hackathonId]);
  const queryKey = ["action", "get-hackathon", params];
  const { data: h, isPending, error } = useActionQuery("get-hackathon", params);
  const [now, setNow] = useState(() => Date.now());
  const [newTask, setNewTask] = useState("");
  const [draft, setDraft] = useState("");
  const [script, setScript] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setDraft(h?.submissionDraft ?? "");
    setScript(h?.demoScript ?? "");
  }, [h?.submissionDraft, h?.demoScript]);

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
      toast.error(actionErrorMessage(err) ?? t("court.saveFailed"));
    },
  });
  const addTasks = useActionMutation("add-tasks", {
    onSuccess: () => setNewTask(""),
    onError: (err) =>
      toast.error(actionErrorMessage(err) ?? t("court.saveFailed")),
  });
  const saveHackathon = useActionMutation("update-hackathon", {
    onSuccess: () => toast.success(t("court.saved")),
    onError: (err) =>
      toast.error(actionErrorMessage(err) ?? t("court.saveFailed")),
  });

  if (isPending) {
    return (
      <main className="grid gap-4 p-4 sm:p-6">
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-3 lg:grid-cols-3">
          {COLUMNS.map((c) => (
            <Skeleton key={c} className="h-72 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }
  if (!h || error) {
    return (
      <main className="p-6">
        <p className="text-sm text-muted-foreground">{t("court.notFound")}</p>
        <Link className="mt-3 inline-block text-sm underline" to="/court">
          {t("court.back")}
        </Link>
      </main>
    );
  }

  const left = formatCountdown(h.deadlineAt, now);
  const criterionName = new Map(h.criteria.map((c) => [c.id, c.name]));
  const unfinished = h.tasks.filter((task) => task.status !== "done");
  const context = `Docket hackathon id: ${h.id} ("${h.name}"). Use get-hackathon first.`;

  function move(task: Task, dir: -1 | 1) {
    const next = COLUMNS[COLUMNS.indexOf(task.status) + dir];
    if (next) patchTask.mutate({ id: task.id, status: next });
  }

  function submitTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTask.trim();
    if (title) addTasks.mutate({ hackathonId: h!.id, tasks: [{ title }] });
  }

  return (
    <main className="flex min-h-full flex-col gap-5 p-4 sm:p-6">
      <header className="grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div className="min-w-0">
          <Link
            to="/court"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {t("court.back")}
          </Link>
          <h1 className="mt-1 flex items-center gap-2 truncate text-xl font-semibold tracking-tight">
            {h.name}
            {h.url ? (
              <a
                href={h.url}
                target="_blank"
                rel="noreferrer"
                aria-label={t("court.openPage")}
                className="text-muted-foreground hover:text-foreground"
              >
                <IconExternalLink className="size-4" />
              </a>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {localDeadline(h.deadlineAt)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-xl px-4 py-2 text-center font-mono",
            left?.urgent
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-foreground",
          )}
        >
          <div className="text-2xl font-semibold">
            {left ? t("court.countdown", left) : t("court.closed")}
          </div>
          <div className="text-xs uppercase tracking-wide opacity-70">
            {t("court.timeLeft")}
          </div>
        </div>
        <div className="rounded-xl bg-muted px-4 py-2 text-center">
          <div className="font-mono text-2xl font-semibold">
            {h.score ?? "--"}
            <span className="text-sm opacity-60">/100</span>
          </div>
          <div className="text-xs uppercase tracking-wide opacity-70">
            {t("court.rubricScore")}
          </div>
        </div>
      </header>

      <Tabs defaultValue="board" className="flex flex-col gap-4">
        <TabsList className="self-start">
          <TabsTrigger value="board">
            <IconChecklist className="size-4" />
            {t("court.tabBoard")}
          </TabsTrigger>
          <TabsTrigger value="court">
            <IconGavel className="size-4" />
            {t("court.tabCourt")}
            {unfinished.length ? (
              <Badge variant="secondary" className="ml-1">
                {unfinished.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="submission">
            <IconWriting className="size-4" />
            {t("court.tabSubmission")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="grid gap-5 xl:grid-cols-[1fr_20rem]">
          <div className="grid gap-4">
            <form onSubmit={submitTask} className="flex gap-2">
              <Input
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder={t("court.newTask")}
                aria-label={t("court.newTask")}
                maxLength={200}
              />
              <Button
                type="submit"
                disabled={!newTask.trim() || addTasks.isPending}
              >
                <IconPlus className="size-4" />
                {t("court.add")}
              </Button>
            </form>
            <div className="grid gap-3 lg:grid-cols-3">
              {COLUMNS.map((col) => {
                const items = h.tasks.filter((task) => task.status === col);
                return (
                  <section
                    key={col}
                    className="min-h-48 rounded-xl border border-border bg-card p-3"
                  >
                    <h2 className="mb-3 flex items-center justify-between border-b border-border pb-2 text-sm font-medium">
                      {t(`court.col_${col}`)}
                      <span className="text-muted-foreground">
                        {items.length}
                      </span>
                    </h2>
                    <div className="grid gap-2">
                      {items.map((task) => (
                        <article
                          key={task.id}
                          className="rounded-lg border border-border bg-background p-2.5"
                        >
                          <p
                            className={cn(
                              "text-sm",
                              task.verdict === "cut" &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {task.title}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {task.criterionId &&
                            criterionName.get(task.criterionId) ? (
                              <Badge variant="outline" className="text-[10px]">
                                {criterionName.get(task.criterionId)}
                              </Badge>
                            ) : null}
                            {task.verdict ? (
                              <Badge className="text-[10px]">
                                {t(`court.verdict_${task.verdict}`)}
                              </Badge>
                            ) : null}
                            <span className="ml-auto flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={col === "todo"}
                                aria-label={t("court.moveBack")}
                                onClick={() => move(task, -1)}
                              >
                                <IconArrowLeft className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={col === "done"}
                                aria-label={t("court.moveForward")}
                                onClick={() => move(task, 1)}
                              >
                                <IconArrowRight className="size-3.5" />
                              </Button>
                            </span>
                          </div>
                        </article>
                      ))}
                      {!items.length ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          {t("court.emptyColumn")}
                        </p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <aside className="grid content-start gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{t("court.rubric")}</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  askCourtAgent(t("court.scorePrompt"), context)
                }
              >
                <IconScale className="size-4" />
                {t("court.score")}
              </Button>
            </div>
            {h.criteria.map((c) => (
              <div key={c.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {c.score ?? "-"}/10 · {c.weight}%
                  </span>
                </div>
                <Progress value={(c.score ?? 0) * 10} />
                {c.rationale ? (
                  <p className="text-xs text-muted-foreground">{c.rationale}</p>
                ) : null}
              </div>
            ))}
            {h.deliverables.length ? (
              <div className="mt-2 border-t border-border pt-3">
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("court.deliverables")}
                </h3>
                <ul className="grid gap-1 text-sm">
                  {h.deliverables.map((d) => (
                    <li key={d}>· {d}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </TabsContent>

        <TabsContent value="court" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              {t("court.courtIntro")}
            </p>
            <Button
              onClick={() => askCourtAgent(t("court.convenePrompt"), context)}
              disabled={!unfinished.length}
            >
              <IconGavel className="size-4" />
              {t("court.convene")}
            </Button>
          </div>
          {unfinished.map((task) => (
            <article
              key={task.id}
              className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_auto] md:items-start"
            >
              <div className="min-w-0">
                <p className="font-medium">{task.title}</p>
                {task.courtArgument ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {task.recommendedVerdict ? (
                      <strong className="text-foreground">
                        {t("court.recommends", {
                          verdict: t(`court.verdict_${task.recommendedVerdict}`),
                        })}{" "}
                      </strong>
                    ) : null}
                    {task.courtArgument}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("court.noArgument")}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                {VERDICTS.map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant={task.verdict === v ? "default" : "outline"}
                    onClick={() =>
                      patchTask.mutate({
                        id: task.id,
                        verdict: task.verdict === v ? null : v,
                      })
                    }
                  >
                    {t(`court.verdict_${v}`)}
                  </Button>
                ))}
              </div>
            </article>
          ))}
          {!unfinished.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("court.allDone")}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="submission" className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{t("court.draft")}</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() => askCourtAgent(t("court.draftPrompt"), context)}
              >
                <IconWriting className="size-4" />
                {t("court.generate")}
              </Button>
            </div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={18}
              className="font-mono text-sm"
              placeholder={t("court.draftPlaceholder")}
            />
          </div>
          <div className="grid gap-2">
            <h2 className="text-sm font-medium">{t("court.demoScript")}</h2>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={18}
              className="font-mono text-sm"
              placeholder={t("court.scriptPlaceholder")}
            />
          </div>
          <div className="lg:col-span-2">
            <Button
              disabled={saveHackathon.isPending}
              onClick={() =>
                saveHackathon.mutate({
                  id: h.id,
                  submissionDraft: draft,
                  demoScript: script,
                })
              }
            >
              {t("court.save")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
