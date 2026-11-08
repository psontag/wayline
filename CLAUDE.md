# Wayline

Web app for planning multi-day bike trips. See `docs/` for details.

## Principles

- Hobby project. Keep it simple. No over-engineering.
- Build vertical slices first.
- Look and feel matter most.

## Writing style

Applies to docs, code comments, commit messages and PR descriptions.

- Use short, simple sentences and plain words.
- Be direct. Say what is, not how it came to be.
- Only write what the reader needs. Leave out the obvious.
- No filler, no marketing tone, no fancy words.
- Don't document history or past decisions. Describe the current state.
- Link to other docs or files only when the reader really needs them.
- Prefer lists and tables over long paragraphs.
- Keep code comments rare. Comment why, not what.

## UI

Follow `docs/07-design-system.md`. Mockups are in `design/`.

- Use components from `packages/ui`. Add a new component there instead of styling inline.
- Every side panel follows "Side panels" in `docs/07-design-system.md`: panel header, then sections with icon, title and summary.
- Use only design tokens. No raw colors, sizes or arbitrary Tailwind values.
- Check every UI change in light and dark mode. The `verify-ui` skill has the steps.
- Use the terms and formats from the design system doc.
- No literal text in components. Use translation keys (`docs/08-translation.md`).
- Errors follow `docs/13-errors.md`: where they show, how they read, which code means what.

## Workflow

- Commands: `pnpm check` (lint, typecheck, test, format check), `pnpm build`, `pnpm dev`.
- In a new worktree, run `pnpm setup:worktree` first.
- Run Python only through uv: `uv run script.py`, `uv run --no-project python -`. Never call `python`, `python3` or `pip` directly. Pipeline scripts run from `pipeline/` with `uv run <script>.py`.
- Edit files with the Edit tool, not with `sed -i` or Python scripts.
- Done means `pnpm check` passes. UI changes are checked in light and dark on `/dev/components` or in the app.
- Never use `PROVIDERS=live` unless asked.
- Never edit an applied migration.
- Prefer few dependencies.
- Code changes go on a branch with a PR via `gh`. Docs-only changes may go to `main`.

## GitHub

Private repo `psontag/wayline`. Use the `gh` CLI for issues, PRs and other GitHub actions.

Work is tracked in issues, milestones and the project board. Issues and PRs start with a plain-language summary: what was wrong or missing, how it worked, what works now. Free text, as long as needed. Technical details come after, for agents. Follow the agent workflow in `docs/11-tracking.md`: claim the issue, ask and record decisions in comments, open a PR with `Closes #<n>`. The `ship` skill has the commands.

## Docs

- Docs live in `docs/` and use a two-digit prefix for ordering: `01-overview.md`, `02-...`.
- One topic per file.
