# Design system

One stylesheet, `src/styles.css`, holds every visual decision. A raw hex, pixel
size or shadow appearing outside the `:root` block is a bug rather than a
shortcut: at the last audit the file had 43 off-scale font sizes, 59 distinct
spacing values and 98 hardcoded colours, and it now has none.

## Tokens

| Group | Tokens | Notes |
| --- | --- | --- |
| Surfaces | `--bg` `--panel` `--panel-2` `--panel-3` `--hover` `--track` `--field` `--code-bg` `--card-top` | Ordered from furthest back to nearest |
| Lines | `--line-soft` `--line` `--line-strong` | Soft for internal dividers, strong for hover states |
| Text | `--text` `--text-1` `--text-2` `--muted` `--dim` `--code-text` `--placeholder` | Every one clears WCAG AA on every surface it is used on |
| Accents | `--human` `--agent` `--warn` `--bad`, each with `-text`, `-wash`, `-tint`, `-edge` | Green is the student, violet is the agent, and that mapping never varies |
| Spacing | `--s-1` (4px) through `--s-11` (40px) | see the stylesheet |
| Radii | `--r-xs` `--r-sm` `--r` `--r-lg` `--r-pill` | see the stylesheet |
| Type | `--t-3xs` (10.5px) through `--t-2xl` (34px), plus `--t-display` | Ten steps, fluid only at display size |
| Elevation | `--e-inset` `--e-raised` | Two levels: panels and the study card |
| Motion | `--dur-fast` `--dur` `--dur-slow` `--ease` | All of it disabled under `prefers-reduced-motion` |

## Colour means one thing

Green is always the student and violet is always the agent: in badges, in the
left edge of activity rows, in the replay transcript and in the note pinned to
a card. Amber is a request waiting on a person. Red is destructive and appears
only on a confirmation the student has to make.

## Components

| Component | Variants | States |
| --- | --- | --- |
| `.btn` | `primary`, default, `quiet`, `danger`, `danger-solid`; sizes `sm`, default, `lg` | hover, active, disabled, focus-visible |
| `.panel` | default, `hero`, `muted-panel` | none |
| `.tool` | default, `hot` (recently called), `off` (withdrawn), `open` | hover, expanded |
| `.impact` | `good`, `bad`, neutral | none |
| `.badge` | `human`, `agent`, `replay` | none |
| `.feed-item` | `human`, `agent`, `replay` | none |
| `.stat` | none | none |
| Inputs | text, `narrow`, textarea, select | focus, placeholder |

One screen carries one primary action. The dashboard has `Study N due cards`;
everything else there is secondary or quiet. The study view has the card
itself, which is why it is the only element with `--e-raised`.

## Themes

`:root` carries the dark values. A light palette is applied when the system asks
for one and the student has not overridden it, and when they pick light
explicitly; picking dark wins over a light system setting in the same way. The
theme is stored under `tandem.theme`, separately from the workspace, so
restoring the sample decks leaves the appearance alone.

The light palette is not the dark one lightened. Accents are re-picked for a
white ground: the dark theme's `#34d399` measures 1.7:1 on white, so the light
theme uses `#047857`, and the same is true of the violet, amber and red. What
does not change is what each colour means.

An agent cannot change the theme. The tool surface is about the student's study
state, and how their screen looks is not part of it.

## Accessibility

- Every text and background pair in use clears 4.5:1. The audit that produced
  this system found `--dim` at 3.4:1 and the withdrawn tool chips faded to an
  unreadable 2:1; both were fixed rather than waived.
- State is never carried by colour alone. Withdrawn tools also take a dashed
  border and a hatch, difficulty bars are `role="meter"` with a value, and the
  session progress bar is a `role="progressbar"`.
- `harness/a11y.mjs` runs axe-core over the dashboard, an active session and a
  pending permission request, in both themes. It exits non-zero on any
  violation. Adding the light theme is how the destructive button's ink and the
  activity feed's missing keyboard access were found.
- Focus is visible everywhere through one `:focus-visible` rule, there is a
  skip link to the board, and coarse pointers get larger hit areas.
