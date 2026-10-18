# Design system

All UI looks the same: same colors, spacing, sizes and components. Light and dark mode are both supported.

## Approach

1. **Tokens** define every visual value in one place.
2. **Components** in `packages/ui` use only tokens.
3. **App code** uses only components from `packages/ui` and layout utilities.
4. **Tooling** blocks anything else.

## Tokens

Tokens are CSS variables in `packages/ui/src/tokens.css`. Each color token has a light and a dark value.

Color tokens are semantic. They name the purpose, not the color.

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-raised` | Page, panels, popovers |
| `text`, `text-muted` | Text |
| `border` | Lines and outlines |
| `accent`, `on-accent` | Primary actions, text on accent |
| `success`, `warning`, `danger` | Status |
| `focus-ring` | Keyboard focus |
| `hover`, `active`, `selected` | Interaction states |
| `scrim` | Behind dialogs and sheets |
| `terrain-paved`, `terrain-gravel`, `terrain-unpaved` | Surface colors in the elevation profile |

Map tokens:

| Token | Use |
|---|---|
| `route`, `route-casing` | Route line and its outline |
| `route-dimmed` | Unselected proposals |
| `route-selected` | Selected proposal or stage |
| `stage-a`, `stage-b` | Stages alternate between these two |
| `marker`, `via-point` | Stops and via points |

Other tokens:

| Group | Values |
|---|---|
| Spacing | 4 px scale: 1, 2, 3, 4, 6, 8, 12, 16 |
| Radius | `sm`, `md`, `lg` |
| Font size | `xs`, `sm`, `base`, `lg`, `xl` |
| Font weight | `normal`, `medium`, `semibold` |
| Line height | `tight`, `normal` |
| Shadow | `sm`, `md` |
| Z-index | `map`, `panel`, `sheet`, `popover`, `dialog`, `toast` |
| Motion duration | `fast`, `normal` |
| Breakpoints | `sm`, `md`, `lg` |

## Styling

- Tailwind CSS v4. Only our tokens exist as classes, e.g. `bg-surface`, `p-4`, `text-muted`.
- Components are based on Radix UI primitives, in the style of shadcn/ui. The code lives in `packages/ui` and is ours to change.
- Icons: Lucide only. No emoji.
- Font: Manrope, system fonts as fallback. Tabular numbers for all stats.
- Look: cool greys, tight corners (4–6 px), one pastel accent (peach). Dark text on pastel fills. Light mode routes get a deeper outline.

## Dark mode

- Default follows the system setting. The user can override it in Settings.
- The choice is stored in local storage and set as `data-theme` on `<html>`.
- Only token values change. Components never check the theme.

## Map

- Base styles: OpenFreeMap Positron (light) and Dark.
- Map and chart colors come from a `useThemeTokens()` hook. It reads the resolved CSS variables and re-applies them on theme change.
- When the base style swaps, our own layers are added again.
- OSM attribution is shown in both themes.

## Enforcement

| Rule | How |
|---|---|
| Only our tokens exist | Tailwind `@theme` resets the defaults (`--*: initial`, including spacing) and defines only our tokens |
| No unknown or arbitrary classes | `eslint-plugin-better-tailwindcss` with `no-unregistered-classes`. If it misses arbitrary values, add a rule against `[` in classes. |
| Apps don't style raw elements like `<button>` | ESLint rule: use `packages/ui` components |
| Readable contrast | Vitest test over token pairs in both themes |
| Every component works in both themes | `/dev/components` page in the app shows every component in light and dark |

## Units and formats

Examples in English:

| Value | Format |
|---|---|
| Distance | `78 km`, `850 m` below 1 km |
| Ascent | `650 m` |
| Temperature | `22 °C` |
| Time | 24 h, `14:30` |
| Date | `Sat 12 Jun` |

All formatting goes through shared functions in `packages/ui`. They follow the current locale (see `08-translation.md`).

## Wording

The same thing always has the same name in the UI. Translations use one fixed term per entry too.

| Term | Meaning |
|---|---|
| Trip | The whole plan |
| Stage | One day of a trip |
| Proposal | A generated trip before it is saved |
| Stop | Place where a stage ends |
| Via point | Point the user adds to change a route |
| Day loop | A one-day ride that ends where it starts |
| Multi-day loop | A multi-day trip that ends where it starts |
