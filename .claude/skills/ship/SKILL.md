---
name: ship
description: Take a Wayline issue from claim to merged PR, following docs/11-tracking.md. Use when starting work on an issue or when a change is ready for a PR.
---

# Ship

Board: project 3, owner `psontag`. Statuses: Backlog, Ready, In progress, In review, Done.

```sh
gh project item-add 3 --owner psontag --url https://github.com/psontag/wayline/issues/<n>   # new issue
gh project item-edit 3 --owner psontag --url https://github.com/psontag/wayline/issues/<n> --field Status --value "In progress"
```

## Steps

1. **Claim.** `gh issue view <n> --comments`. Comment `Starting on branch <n>-<short-name>.` Move to In progress.
2. **Branch.** `git fetch -q origin` and `git switch -c <n>-<short-name> origin/main`. In a new worktree, run `pnpm setup:worktree` first.
3. **Work.** Record decisions as issue comments. Questions for the owner: comment and add `needs-human`.
4. **Check.** `pnpm check`. For UI changes, also `pnpm e2e` and the `verify-ui` skill. For pipeline changes, `pnpm test:pipeline`.
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
