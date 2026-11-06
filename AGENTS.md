# Chat — Agent Guide

Chat is the minimal chat-first agent-native app. `/` redirects to shared sign-in, then `/home`, the editable Get started page. Chat lives at `/chat`; new chats start there. Actions carry capabilities; screens exist only for durable workflows.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.

## Docket

Hackathon copilot for solo builders. `/court` lists hackathons and imports a new one from a link; `/court/:hackathonId` groups tasks under their rubric criterion, with verdicts inline, a Checks tab, and a Submission tab that saves on blur. No sidebar: the top bar holds the Docket logo (home), settings, chats, and the agent toggle. Sign-in lands on `/court`.

- Import: `read-link` the real page (and rules page), then `create-hackathon` (one board per page: a repeated import returns the existing board). Never invent a deadline; ask. With no stated weights, split them equally and say so.
- Rubric scores are 0-10 per criterion; the weighted total out of 100 is computed server-side. Only `save-judgment` writes scores, under the Judge Guard (`server/lib/guard.ts`).
- Review (one button): one `recommend-verdicts` call sets `recommendedVerdict` + `courtArgument` on open tasks. It never scores. Only the user sets `verdict` (ship | fake | cut) unless they ask.
- Radar (`/court`): open hackathons first by deadline, each with judged score, prize (`prizeUsd`, total USD pool, only if the page states it), and countdown. Two open deadlines within 48h clash: amber left bar and countdown, names in the tooltip.
- Times are stored as UTC ISO; send ISO 8601 with an offset and show the user's local time.
- On board pages `navigation` adds `hackathonId`.
- UI rule: no taglines, helper text, or secondary labels. If a screen needs them, fix the layout. Details live in tooltips (`title`).
- Checks: hackathon rules saved with `add-checks` and verified by `verify-checks` against `repoUrl`/`demoUrl` (GitHub API, the demo page's own metadata). Deterministic, no model; only `manual` checks are ticked by hand. Logic in `server/lib/verify.ts`.
- Judge: `gather-submission` then `save-judgment`. Fixes are tasks with `points` set; a new pass replaces open fixes and keeps done ones.
- Status: the UI shows open/done; `doing` is accepted and shown as open.

| Action | Purpose |
| --- | --- |
| read-link | Read any link (pages, JS sites, PDFs, X posts, GitHub) as Markdown |
| create-hackathon | Board from name, deadline, rubric, deliverables, tasks |
| list-hackathons | Radar: open boards first, prize, judged score, 48h clashes |
| get-hackathon | Full board with scores and tasks |
| update-hackathon | Patch deadline, summary, deliverables, submission draft, demo script, repo/demo links |
| add-tasks | Append tasks |
| update-task | Patch title, notes, status, criterion, verdict |
| recommend-verdicts | Recommend ship/fake/cut for open tasks in one call |
| add-checks | Save submission rules as verifiable checks |
| update-check | Tick a manual check, rename, or remove |
| verify-checks | Verify all automatic checks against the real repo and demo |
| gather-submission | Everything a judge sees: rubric, README, description, demo, checks, past winners |
| save-judgment | Judge scores plus up to 3 point-tagged fixes pinned on the board |
