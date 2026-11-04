# Docket

Paste a hackathon link. Get the board that wins it.

Most hackathon entries lose points on things nobody checked: a rule missed, a
private repo, a demo over the time limit, a README a judge can't follow. Docket
reads the hackathon page, turns its rubric into a weighted task board, checks
the rules against your real repo and demo, and judges your entry the way a
judge would, so you spend the last days on the fixes worth the most points.

## How it works

1. **Import.** Paste any hackathon link (a page, a PDF, a GitHub README, or an
   X post). The agent reads it and creates the board: the deadline, the
   rubric criteria with their weights, the deliverables, and starter tasks
   under each criterion.
2. **Board.** Tasks are grouped by criterion, with the score out of 10 and the
   weight for each. Review scores your progress and marks each open task Ship,
   Fake, or Cut, with its reasoning.
3. **Checks.** The rules become checks. Automatic checks run against your real
   links with no model involved: is the repo public, is the README real, does
   `package.json` use the required tech, does the demo open, and is the video
   under the time limit. A check can't be talked into passing.
4. **Judge.** The agent gathers what a judge would actually see (README,
   description, demo, check results), scores each criterion, and pins the
   three fixes that gain the most weighted points, each with its +points.
5. **Submission.** The description and demo script are drafted from the board
   and saved as you edit.

## Agent-native by design

Every capability is a single `defineAction()` that the UI and the agent share:
`read-link`, `create-hackathon`, `add-tasks`, `update-task`, `score-rubric`,
`add-checks`, `verify-checks`, `gather-submission`, `save-judgment`, and more.
The buttons call the same actions the agent calls, so anything you can tap, you
can also ask for in chat. When the agent changes the board, the board updates
live.

Review and Judge run in the background. The button shows progress, and the
board fills in when the agent saves.

## Stack

- Agent-Native v0.223 (React Router,
  Drizzle, Postgres in production, PGlite locally)
- A deterministic verifier (`server/lib/verify.ts`) using the GitHub API and the
  demo page's own video metadata
- A universal link reader (`server/lib/reader.ts`) for HTML, JS-rendered pages,
  PDFs, GitHub READMEs, and X posts

## Run it

```bash
corepack enable
pnpm install
pnpm dev
```

Production:

```bash
pnpm build
pnpm migrate:production   # needs DATABASE_URL
PORT=8081 pnpm start      # needs DATABASE_URL and BETTER_AUTH_SECRET
```

Connect a model in Settings: Builder.io, or any OpenAI-compatible provider.

## Pre-existing work

Built solo for the Builder.io Agent-Native Hackathon (October to November 2026).
The app shell was scaffolded with `agent-native create --template chat`. The
hackathon board, Checks, Judge, link reader, actions, and data model were
written during the hackathon.
