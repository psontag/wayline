---
name: ship
description: Take a Wayline issue from claim to merged PR, following docs/11-tracking.md. Use when starting work on an issue or when a change is ready for a PR.
---

# Ship

Board: project 3, owner `psontag`. Status field `PVTSSF_lAHOAHJMTs4BnpPjzhmM2fQ`.

| Status | Option id |
|---|---|
| Ready | `c734252b` |
| In progress | `c364e637` |
| In review | `c3035081` |
| Done | `96d799fa` |

Move an item:

```sh
item=$(gh project item-list 3 --owner psontag --format json -L 500 -q ".items[] | select(.content.number == <n>) | .id")
gh project item-edit --project-id PVT_kwHOAHJMTs4BnpPj --id "$item" --field-id PVTSSF_lAHOAHJMTs4BnpPjzhmM2fQ --single-select-option-id <option id>
```

## Steps

1. **Claim.** `gh issue view <n> --comments`. Comment `Starting on branch <n>-<short-name>.` Move to In progress.
2. **Branch.** `git fetch -q origin` and `git switch -c <n>-<short-name> origin/main`. In a new worktree, run `pnpm setup:worktree` first.
3. **Work.** Record decisions as issue comments. Questions for the owner: comment and add `needs-human`.
4. **Check.** `pnpm check`. For UI changes, run the `verify-ui` skill.
5. **Commit.** Run `git commit` on its own, not chained after other commands. Message per the writing style in CLAUDE.md.
6. **Screenshots** (UI only). Commit them on top of `origin/pr-assets` in `pr-<n>/`, from a separate worktree:

   ```sh
   git fetch -q origin pr-assets
   git worktree add -q "$TMPDIR/pr-assets" origin/pr-assets
   # copy PNGs to $TMPDIR/pr-assets/pr-<pr number>/, then:
   git -C "$TMPDIR/pr-assets" add . && git -C "$TMPDIR/pr-assets" commit -m "Screenshots for #<pr number>"
   git -C "$TMPDIR/pr-assets" push origin HEAD:pr-assets
   git worktree remove "$TMPDIR/pr-assets"
   ```

   If the push is rejected: fetch, rebase, push. Never force push. Link as `https://github.com/psontag/wayline/blob/pr-assets/pr-<n>/<file>.png?raw=true`, light and dark side by side in a table.
7. **PR.** `git push -u origin HEAD`, then `gh pr create` with the body from `.github/pull_request_template.md`: `Closes #<n>`, plain-language summary, screenshots, details for agents. Move the issue to In review.
8. **Merge.** When CI is green: `gh pr merge <pr> --merge --delete-branch`. Move the issue to Done.
9. **Clean up.** `pnpm worktree:prune` lists merged worktrees and branches; add `--yes` to remove them.

Docs-only changes may go straight to `main`. Pull first, since the push is rejected when `main` moved.
