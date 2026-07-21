# C4C Lab — Design System

Source of truth for the visual language. Where this conflicts with a default,
this wins. Tokens live in `src/styles/theme.css` — consume the variables and
component classes, never hardcode hex values in views.

## Brand

The palette is **violet `#7400F9`** and **plum `#2A0B52`**. Both stay. The goal
is to use purple like a studio, not like a Tailwind default:

- **Plum is the dominant dark ground** the whole app sits on. Every view is
  built on the plum ground ramp (`--ground-0` … `--ground-4`), never on white.
- **Violet is an accent only**: primary buttons, active nav, focus rings, key
  emphasis. Never the fill of every card. If more than ~15% of a screen is
  saturated violet, pull it back.
- **Violet gradient on a white background is banned.** It is the signature
  AI-slop look.
- **One warm amber accent** (`--amber`) may appear rarely, for active/live
  states only. Never decorative.

## Typography

- **Horizon** (`--font-display`, `.font-display`) carries all headings and
  display moments. Licensed files go in `public/fonts/horizon/`; until they
  exist, **Orbitron** stands in with the same wide geometric voice. Each major
  view gets one genuine display-size heading with room to breathe (the face
  runs wide, so display sizes are 30-36px).
- **Poppins** (`--font-body`) is body and UI text only. Poppins never goes
  above ~24px.

## Depth

Flat fills are banned on grounds. The page ground gets the gradient mesh +
grain overlay (`.app-ground`). Cards get a faint top-light gradient
(`.card`), a hairline border, and real shadow — not a flat plum rectangle.

## Radius

Use the scale, never one uniform radius on everything:

- `--radius-sm` (8px) — chips, tags, small inputs
- `--radius-md` (12px) — buttons, inputs, small cards
- `--radius-lg` (18px) — cards, modals, media
- `--radius-pill` — pills, avatars, count badges

## Layout

Break dead-center, evenly-padded layouts. Data-heavy views (galleries, project
lists, admin tabs) should feel dense and confident. Use asymmetry; let a few
elements break the grid where it earns it.

## Motion

One orchestrated page-load animation per view: staggered reveals via
`.anim-rise` + `.d1`–`.d6` delay classes. No scattered micro-interactions.
Always respect `prefers-reduced-motion`.

## Voice

Second person. No em dashes. Plain and confident. No filler ("seamless",
"elevate", "unlock"). Buttons are short and specific: "Send gallery", not
"Submit". Empty states tell you what to do next, not how the feature feels.

## Accessibility

Maintain contrast on the plum ground (body text is `--ink-hi` / `--ink-mid`,
never `--ink-low` for meaning-bearing text). Every interactive element keeps a
visible focus state (`--focus-ring`). Keyboard nav is never sacrificed for
looks.
