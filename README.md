# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? Install [Bun](https://bun.sh), then run:

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev
```

Run the same validation used in CI before opening a pull request:

```sh
bun run check
```

## GitHub Pages deployment

The `Deploy to GitHub Pages` workflow validates and deploys every push to `main`. It can
also be started manually from the repository's **Actions** tab for a full deploy on
demand.

Before the first deployment, open **Settings → Pages** and set **Source** to
**GitHub Actions**. The workflow automatically uses GitHub's reported Pages base path,
so both project sites and custom domains build with correct asset and router URLs.

Dependabot checks Bun packages daily and GitHub Actions weekly. Patch and minor update
pull requests are set to auto-merge after the complete CI job passes; major updates
remain open for review.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
