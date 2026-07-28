// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  // TanStack's static prerenderer uses its own dist/server output while Nitro
  // targets server runtimes. Keep Nitro for Lovable and disable it for Pages.
  nitro: isGitHubPagesBuild ? false : undefined,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
    ...(isGitHubPagesBuild
      ? {
          // GitHub Pages is static hosting, so emit HTML for every discoverable static route.
          prerender: {
            enabled: true,
            crawlLinks: true,
            failOnError: true,
          },
        }
      : {}),
  },
  vite: {
    // GitHub Pages project sites are served below /<repository>/.
    // The Pages workflow supplies the exact path reported by GitHub.
    base,
  },
});
