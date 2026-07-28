# Grok Of Duty

Browser-native 3D tactical shooter. Play at
[michaelbastos.com/grok-of-duty](https://michaelbastos.com/grok-of-duty/).

## Development

```sh
bun install
bun run dev
```

Validate before opening a pull request:

```sh
bun run check
```

## Production

- Deployed via GitHub Pages (Actions).
- Google Analytics (`G-QFWCR1XG0X`) and AdSense (`ca-pub-4228490019228264`) load
  only on `michaelbastos.com` / `www.michaelbastos.com`.
- Landing ads are manual placements only (mid-page + pre-footer). Auto/anchor ads
  are suppressed in CSS so they never push the hero.

## Stack

TanStack Start · TypeScript · React · Three.js · Tailwind CSS
