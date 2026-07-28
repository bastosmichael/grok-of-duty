<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Required completion checks

Before an agent considers implementation work complete, it must run and pass:

```sh
bun run lint
bun run typecheck
bun run test
GITHUB_PAGES=true VITE_BASE_PATH=/grok-of-duty/ bun run build
```

For pull requests, merge the current `origin/main` into the working branch
without rebasing or rewriting published history, rerun the full validation
sequence after that merge, and confirm the required GitHub Actions checks pass.
Do not report the work as complete while any required local or remote check is
failing.
