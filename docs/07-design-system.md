# Design system

All UI looks the same: same colors, spacing, sizes and components. Light and dark mode are both supported.

## Approach

1. **Tokens** define every visual value in one place.
2. **Components** in `packages/ui` use only tokens.
3. **App code** uses only components from `packages/ui` and layout utilities.
4. **Tooling** blocks anything else.

## Tokens

Tokens are CSS variables in `packages/ui/src/tokens.css`. Each color token has a light and a dark value, written as `light-dark(light, dark)`.

Color tokens are semantic. They name the purpose, not the color.

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-raised` | Page, panels, popovers |
| `text`, `text-muted` | Text |
| `border` | Lines and outlines |
| `accent`, `on-accent` | Primary actions, text on accent |
| `success`, `warning`, `danger` | Status |
| `focus-ring` | Keyboard focus |
| `hover`, `active`, `selected`, `selected-border` | Interaction states |
| `scrim` | Behind dialogs and sheets |
| `inverse`, `on-inverse`, `inverse-accent` | Toasts and tooltips |
| `terrain-paved`, `terrain-gravel`, `terrain-unpaved` | Surface colors in the elevation profile |

Map tokens:

| Token | Use |
|---|---|
| `route`, `route-casing` | Route line and its outline |
| `route-dimmed` | Unselected routes in the legend |
| `route-selected` | Selected stage |
| `stage-a`, `stage-b` | Stages in the trip editor alternate between these two |
| `route-best`, `route-nature`, `route-flat`, `route-hilly`, `route-sights` | One color per proposal on the proposals map, by flavour or list order |
| `on-route` | Text on a route color |
| `route-outline` | Casing of the highlighted proposal |
| `hillshade-shadow`, `hillshade-highlight` | Terrain shading on the maps |
| `marker`, `via-point` | Stops and via points |
| `network` | Signed cycling routes, a quiet layer below the route |

Color values:

| Token | Light | Dark |
|---|---|---|
| `bg` | `#F6F7F9` | `#101216` |
| `surface` | `#FFFFFF` | `#171A20` |
| `surface-raised` | `#FFFFFF` | `#1E222A` |
| `text` | `#15181D` | `#EDEFF3` |
| `text-muted` | `#5A616C` | `#A0A7B3` |
| `border` | `#E1E4EA` | `#2A2F38` |
| `accent` | `#FFB088` | `#FFB088` |
| `on-accent` | `#3B1503` | `#2A0F02` |
| `success` | `#2F9E6B` | `#5CCB97` |
| `warning` | `#B7791F` | `#F2CF7E` |
| `danger` | `#C2412D` | `#FF8F7D` |
| `focus-ring` | `#B4532A` | `#FFB088` |
| `hover` | `#EEF0F4` | `#20242C` |
| `active` | `#E4E7EC` | `#2A2F38` |
| `selected` | `#FFEDE3` | `#2D211B` |
| `selected-border` | `#B4532A` | `#FFB088` |
| `scrim` | black 35 % | black 55 % |
| `inverse` | `#15181D` | `#EDEFF3` |
| `on-inverse` | `#EDEFF3` | `#15181D` |
| `inverse-accent` | `#FFB088` | `#B4532A` |
| `terrain-paved` | `#7E8BA3` | `#AEB9CC` |
| `terrain-gravel` | `#E8B850` | `#F2CF7E` |
| `terrain-unpaved` | `#B98E73` | `#D9B49C` |
| `route`, `route-selected` | `#FF9A73` | `#FFA67F` |
| `route-casing` | `#B4532A` | `#101216` |
| `route-dimmed` | `#C3C8D0` | `#4B5260` |
| `stage-a` | `#FFC7AE` | `#C98C72` |
| `stage-b` | `#C9BDE6` | `#8F82B8` |
| `marker` | `#15181D` | `#EDEFF3` |
| `via-point` | `#B4532A` | `#FFB088` |
| `network` | `#9DB7A0` | `#4E6B57` |
| `route-best` | `#FF9A73` | `#FFA67F` |
| `route-nature` | `#3FB37A` | `#62D197` |
| `route-flat` | `#4F9FF0` | `#6DB4FF` |
| `route-hilly` | `#A685EC` | `#BB9EFF` |
| `route-sights` | `#EE7FB4` | `#FF93C6` |
| `on-route` | `#15181D` | `#101216` |
| `route-outline` | `#3A3F48` | `#0B0C0F` |
| `hillshade-shadow` | `#5A616C` | `#000000` |
| `hillshade-highlight` | `#FFFFFF` | `#8B93A0` |

Other tokens:

| Group | Values |
|---|---|
| Spacing | 4 px steps, also for sizes: `0.5`–`3.5` in half steps, `4`–`12`, `14`, `16`, `20`, `24`, `px` |
| Width | `sm` 384 px, `panel` 440 px, `page` 1120 px |
| Radius | `sm` 4 px, `md` 6 px, `lg` 8 px, `xl` 16 px (sheets), `full` |
| Font size | `2xs` 11, `xs` 12, `sm` 13, `base` 14, `md` 15, `lg` 18, `xl` 22, `2xl` 28 px |
| Font weight | `normal`, `medium`, `semibold`, `bold`, `extrabold` |
| Line height | `tight` 1.15, `normal` 1.5 |
| Letter spacing | `tight` −0.02 em, `wide` 0.06 em |
| Shadow | `sm`, `md`, `sheet` (upwards, for bottom sheets) |
| Z-index | `map`, `panel`, `sheet`, `popover`, `dialog`, `toast` |
| Motion duration | `fast` 120 ms, `normal` 200 ms |
| Breakpoints | `sm` 640, `md` 768, `lg` 1024 px |

## Styling

- Tailwind CSS v4. Only our tokens exist as classes, e.g. `bg-surface`, `p-4`, `text-text-muted`.
- Components are based on Radix UI primitives, in the style of shadcn/ui. The code lives in `packages/ui` and is ours to change.
- Icons: Lucide only. No emoji.
- Font: Manrope, system fonts as fallback. Tabular numbers for all stats.
- Look: cool greys, tight corners (4–6 px), one pastel accent (peach). Dark text on pastel fills. Light mode routes get a deeper outline.

## Dark mode

- Default follows the system setting. The user can override it in Settings.
- The choice is stored in local storage and set as `data-theme` on `<html>`.
- Only token values change. Components never check the theme.
- `data-theme` on any element forces its subtree into that theme. `/dev/components` uses this.

## Map

- Base styles: OpenFreeMap Positron (light) and Dark.
- Map and chart colors come from a `useThemeTokens()` hook. It reads the resolved CSS variables and re-applies them on theme change.
- When the base style swaps, our own layers are added again.
- OSM attribution is shown in both themes.

## Enforcement

| Rule | How |
|---|---|
| Only our tokens exist | Tailwind `@theme` resets the defaults (`--*: initial`, including spacing) and defines only our tokens |
| No unknown classes | `eslint-plugin-better-tailwindcss` `no-unknown-classes`, entry point `tokens.css` |
| No arbitrary values | `no-restricted-classes` with a pattern against `[...]` and `(...)` in the utility part. Arbitrary variants like `data-[state=on]:` stay allowed. |
| Apps don't use raw `<button>`, `<input>`, `<select>`, `<textarea>` | ESLint `no-restricted-syntax` in `apps/web` |
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
| Theme | What a trip should lean toward: Nature, Rivers & lakes, Wine or Culture |
| Length | One day or several days |
| Shape | A to B or loop |
| Back by | Latest arrival on the last day |
| Half day, short day | A day shortened by a late start or an early back-by time |
| Proposed route | The route of a stage as proposed, shown after a change |
| Changed, Revert | A stage that differs from its proposal, and the action that restores it |
| Direct, longer, scenic | Characters of one-day A to B proposals |
