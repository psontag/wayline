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
| A screen or panel has nothing to show | `MessagePanel`: icon, title, text, one primary action | Could not load your trips. · Try again |
| An action failed and nothing changed | `Toast`, with Try again when it helps | Couldn't reach the router, so nothing changed. |
| A save failed | `SaveStatus` `error`, plus a toast with Try again | Not saved |
| An action in a dialog failed | Text below the control, inside the dialog | Could not share the trip. Try again. |
| Optional data is missing | Muted text in its place | Timetable not available. Search on bahn.de. |
| A problem with the plan, not the app | `WarningText` | 1 place to sleep |
| Unknown URL or unknown trip | `MessagePanel` with Back to trips | This trip doesn't exist or isn't shared with you. |
| A crash inside a screen | Root route error component with `MessagePanel` and Reload | Something went wrong. |

- Inline error text uses `text-danger` and `role="alert"`. Loading and status text uses `role="status"`.
- A field with an error sets `aria-invalid` and points to the error with `aria-describedby`.
- Toasts stay 8 s and can be closed. On phones they sit above the bottom sheet.
- Don't put error details in tooltips. Touch screens can't hover.

## Text

- Title: what happened, in a few words. "Could not load your trips."
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
| Offline (`fetch` rejects) | You're offline. | Try again | When back online |
| Anything else | Something went wrong. | Try again or Reload | No |

## Code

- Throw `WaylineError` at the edge of every service: trip stores, providers, the API. A plain `Error` means a bug.
- Turn HTTP answers into `WaylineError` in one place (`readJson` in `apps/web/src/data/apiClient.ts`).
- Every `useQuery` renders its pending, error and data states. Every `useMutation` has an error state in the UI.
- Map errors to text in one shared function. Screens don't write their own `switch` over codes.
- The root route has an error component and a not-found component. A failed lazy chunk after a deploy shows "A new version is available." with Reload.
- Log with `console.warn` when the app recovers, `console.error` for bugs. The API logs unknown errors and answers with the generic error shape.
- Tests cover the error state of each screen that loads data.
