# Tracking

Work is tracked on GitHub: milestones, issues and the "Wayline" project board.

## Structure

| Item | Use |
|---|---|
| Milestone | One per roadmap slice (`10-roadmap.md`) |
| Epic issue | One per milestone. Goal, screens, task list, open questions. Label `epic`. |
| Task issue | One PR worth of work. Label `task` plus an `area:*` label. |
| Project board | Status of every issue |

Board columns: Backlog → Ready → In progress → In review → Done.

- **Backlog**: not ready, or depends on open work.
- **Ready**: clear enough for an agent to start.
- **In progress**: someone works on it.
- **In review**: PR open.
- **Done**: PR merged.

## Writing issues and PRs

Every epic, task and PR starts with a **Summary** in plain language, for the owner:

- **Why:** why we do this
- **Before:** how it works today
- **After:** how it will work
- **Solves:** which problem goes away

No technical terms in the summary. Technical details go below, under **For agents**.

## Labels

| Label | Meaning |
|---|---|
| `task`, `epic`, `bug` | Type |
| `area:ui`, `area:web`, `area:api`, `area:planner`, `area:pipeline`, `area:infra` | Part of the code |
| `blocked` | Waits on another issue or outside answer. The issue says on what. |
| `needs-human` | Needs a decision or action from the owner |

## Agent workflow

1. **Pick** a task in Ready that is not `blocked` and whose dependencies are done.
2. **Claim** it: move it to In progress and comment `Starting on branch <name>.`
3. **Work** on a branch named `<issue number>-<short-name>`.
4. **Ask** in the issue:
   - Questions for the owner: comment and add `needs-human`.
   - Questions for another agent: comment on that agent's issue or PR and link back.
5. **Record** decisions made during the work as issue comments.
6. **Open a PR** with `Closes #<n>`. Fill in the PR template, starting with the plain-language summary. UI changes need screenshots. Move the issue to In review.
7. **Merge** the PR once CI passes (`gh pr merge --merge --delete-branch`). No owner review needed. Make sure the issue is Done on the board.

Screenshots go into the PR. Mockups referenced from issues live in `design/`.

## Screenshots

`gh` can't upload images. Screenshots live on the `pr-assets` branch instead: an orphan branch with only images, one folder per PR (`pr-<n>/`).

- Commit them on top of `origin/pr-assets` and push. If the push is rejected, fetch and rebase, then push again. Never force push.
- Link them in the PR body: `![desktop light](https://github.com/psontag/wayline/blob/pr-assets/pr-<n>/desktop-light.png?raw=true)`.
- Show light and dark side by side in a table.

## Commands

```sh
gh issue list --label task --milestone "2 · Route A to B"
gh issue view <n> --comments
gh issue comment <n> --body "..."
gh issue edit <n> --add-label needs-human
gh project item-list <project number> --owner psontag
```
