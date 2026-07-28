// Shared Vite + TanStack Start preset. Do not re-add those plugins manually.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  // Static GitHub Pages has no server runtime — disable Nitro for that build.
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
