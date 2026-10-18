# Design system

All UI looks the same: same colors, spacing, sizes and components. Light and dark mode are both supported.

## Approach

1. **Tokens** define every visual value in one place.
2. **Components** in `packages/ui` use only tokens.
3. **App code** uses only components from `packages/ui` and layout utilities.
4. **Tooling** blocks anything else.

## Tokens

Tokens are CSS variables in `packages/ui/src/tokens.css`. Each color token has a light and a dark value.

Color tokens are semantic. They name the purpose, not the color:

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-raised` | Page, panels, popovers |
| `text`, `text-muted` | Text |
| `border` | Lines and outlines |
| `accent`, `accent-text` | Primary actions, selection |
| `success`, `warning`, `danger` | Status |
| `route-1` … `route-5` | Proposal and stage colors on the map |
| `surface-paved`, `surface-gravel`, `surface-unpaved` | Surface colors in the elevation profile |

Other tokens:

| Group | Values |
|---|---|
| Spacing | 4 px scale: 1, 2, 3, 4, 6, 8, 12, 16 |
| Radius | `sm`, `md`, `lg` |
| Font size | `xs`, `sm`, `base`, `lg`, `xl` |
| Shadow | `sm`, `md` |

## Styling

- Tailwind CSS v4. The default theme is removed. Only our tokens exist as classes, e.g. `bg-surface`, `p-4`, `text-muted`.
- Components are based on Radix UI primitives, in the style of shadcn/ui. The code lives in `packages/ui` and is ours to change.
- Icons: Lucide only.
- Font: Inter, system fonts as fallback.

## Dark mode

- Default follows the system setting. The user can override it.
- The choice is stored in local storage and set as `data-theme` on `<html>`.
- Only token values change. Components never check the theme.
- The map has a light and a dark base style. Route lines, markers, the elevation profile and the weather strip use the same tokens.

## Enforcement

| Rule | How |
|---|---|
| No hex, rgb or px values outside `tokens.css` | Stylelint |
| No arbitrary Tailwind values like `p-[13px]` or `bg-[#123]` | ESLint Tailwind plugin |
| No colors outside our tokens | Default Tailwind palette is removed |
| Apps don't style raw elements like `<button>` | ESLint rule: use `packages/ui` components |
| Every component works in both themes | Storybook story per component, shown in light and dark |
| No visual regressions | Playwright screenshots of stories in both themes in CI |
| Readable contrast | Contrast check of token pairs in both themes in CI |

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
