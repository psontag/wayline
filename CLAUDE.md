# Wayline

Web app for planning multi-day bike trips. See `docs/` for details.

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

Follow `docs/07-design-system.md`.

- Use components from `packages/ui`. Add a new component there instead of styling inline.
- Use only design tokens. No raw colors, sizes or arbitrary Tailwind values.
- Check every UI change in light and dark mode.
- Use the terms and formats from the design system doc.
- No literal text in components. Use translation keys (`docs/08-translation.md`).

## GitHub

Private repo `psontag/wayline`. Use the `gh` CLI for issues, PRs and other GitHub actions.

## Docs

- Docs live in `docs/` and use a two-digit prefix for ordering: `01-overview.md`, `02-...`.
- One topic per file.
