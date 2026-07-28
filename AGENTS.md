# Project notes for agents

- Prefer small, focused changes that keep `bun run check` green.
- Game code lives under `src/game/`; the marketing site is `src/routes/index.tsx`.
- Google Analytics / AdSense: `src/lib/google-services.ts` — production hosts only.
- Landing ads: mid-page + pre-footer via `AdSlot` only. Do not add a top-of-page
  unit that pushes the hero. Auto Ads / anchor overlays are CSS-suppressed.
- Do not reintroduce third-party editor branding or telemetry.
