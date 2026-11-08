# Errors

How errors look, read and flow through the code. The same rules apply on phones and on desktop.

## Principles

- Say what happened and what to do next.
- Keep the user's work. An edit is never lost without a word.
- Show the error where it happened: on the field, in the row, in the panel.
- Show each error once. No toast for an error that is already shown inline.
- Always offer a way on: try again, go back or change the input.
- Optional data (weather, trains, hotel previews) fails quietly. Say it's missing in its place; the rest of the screen works.
- Never show a raw message, status code or stack trace.

## Where errors show

| Case | Show with | Example |
|---|---|---|
| Wrong input in a field | `FormField` `error` | Enter 20 to 250 km. |
| A screen or panel could not load | `ErrorPanel` (`ErrorScreen` for a whole screen) | Could not load your trips · You're offline. · Try again |
| An action failed and nothing changed | `Toast`, with Try again when it helps | Could not reach the router, so nothing changed. |
| A save failed | `SaveStatus` `error`, plus a toast with the action for the code | Could not save the last change. · Try again |
| An action next to its button failed, also in dialogs | `InlineError` | Could not create the trip. You're offline. |
| Optional data is missing | Muted text in its place | Timetable not available. Search on bahn.de. |
| A problem with the plan, not the app | `WarningText` | 1 place to sleep |
| Unknown trip | `ErrorScreen` with Back to trips | This trip doesn't exist |
| Unknown URL | `NotFoundScreen`, the router's default | Page not found |
| A crash inside a screen, or a stale screen after a deploy | `ErrorScreen`, the router's default | A new version is available · Reload |

- `ErrorPanel`, `ErrorScreen` and `NotFoundScreen` are in `apps/web/src/components/ErrorPanel.tsx`. They pick icon, text and button by code.
- Loading and status text uses `role="status"`. `InlineError`, `FormField` errors and `ErrorPanel` use `role="alert"`.
- A field with an error sets `aria-invalid` and `aria-describedby`. `FormField` gives the error the id `${htmlFor}-error`.
- Toasts stay 8 s and can be closed. A toast for a failed save stays until it is closed or its action runs.
- Don't put error details in tooltips. Touch screens can't hover.

## Text

- Title: what happened, in a few words, no period. "Could not load your trips"
- Text: the next step, and the cause when the user can act on it.
- Name the thing: "the router", "the weather forecast", "the train timetable". Not "the server" or "the request".
- Use "Could not …". Not "Failed to …", "Error:" or "Oops".
- Don't blame the user. Not "invalid" or "wrong". Say what to enter.
- Buttons are verbs: Try again, Reload, Back to trips.
- All text comes from translation keys (`08-translation.md`).

## Error codes

Services throw `WaylineError` with a code (`packages/domain/src/errors.ts`). The API sends the same codes (`02-architecture.md`). The UI picks its text by code, never by `message`.

| Code | User sees | Action | Retry automatically |
|---|---|---|---|
| `PROVIDER_UNAVAILABLE` | Could not reach the {{thing}}. | Try again | Yes, up to 2 times |
| `RATE_LIMITED` | Too many requests. Try again in a minute. | Try again, after `retryAfter` | No |
| `NOT_FOUND` | This trip doesn't exist or isn't shared with you. | Back to trips | No |
| `CONFLICT` | This trip changed somewhere else. | Reload trip | No |
| `INVALID` | The text on the field. Without a field it is a bug: generic text. | Try again | No |
| `UNAUTHORIZED` | You're logged out. | Log in | No |
| `OFFLINE` | You're offline. | Try again | When back online |
| `INTERNAL`, or not a `WaylineError` | Something went wrong. | Try again or Reload | Yes, up to 2 times |

## Code

- Throw `WaylineError` at the edge of every service: trip stores, providers, the API. A plain `Error` means a bug.
- Turn HTTP answers into `WaylineError` in one place (`readJson` in `apps/web/src/data/apiClient.ts`). Fetch through `offlineAware`, so a lost connection becomes `OFFLINE`.
- Every `useQuery` renders its pending, error and data states. Every `useMutation` has an error state in the UI.
- Get error text from `apps/web/src/errors.ts`: `useErrorText` for panels, `useFailedText` for one-line errors ("Could not save the trip. You're offline."). Screens don't write their own `switch` over codes. A screen may set its own title, e.g. "Could not load your trips".
- Queries retry by `shouldRetry` in the same file.
- The root route has an error component and a not-found component. A failed lazy chunk after a deploy shows "A new version is available." with Reload.
- Log with `console.warn` when the app recovers, `console.error` for bugs. The API logs unknown errors and answers with the generic error shape.
- Tests cover the error state of each screen that loads data.
