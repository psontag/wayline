---
name: verify-ui
description: Check a Wayline UI change in the browser pane in light and dark, desktop and phone, and take screenshots for the PR. Use after any change to apps/web or packages/ui.
---

# Verify UI

1. Start the app: `preview_start` with name `wayline`. It runs `pnpm dev` on free ports. Use the URL in the result, not a fixed port.
2. Open the page you changed. For a component in `packages/ui`, open `/dev/components`. Routes: `/`, `/new`, `/import`, `/proposals`, `/trips/<id>`, `/settings`, `/map`.
3. Check with text tools first: `read_console_messages` (errors only), then `read_page` or `get_page_text`.
4. Take a `computer` screenshot before any click by coordinate. Coordinates refer to the last screenshot. Prefer `ref` from `find` or `read_page`.
5. Check four states. The app follows the system theme, so switch it with `resize_window`:

   | State | Call |
   |---|---|
   | Desktop light | `preset: "desktop", colorScheme: "light"` |
   | Desktop dark | `colorScheme: "dark"` |
   | Phone dark | `preset: "mobile"`, reload |
   | Phone light | `colorScheme: "light"` |

6. If `tabs_context` says the pane is hidden, screenshots time out. Ask the user to show the pane.
7. Compare with the mockup in `design/` and the rules in `docs/07-design-system.md`: tokens only, components from `packages/ui`, translation keys, side panel layout.
8. Fix, then check again from step 3.
9. Reset with `preset: "desktop"` when done.

For the PR, save the four screenshots and follow the `ship` skill.
