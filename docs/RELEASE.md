# Releasing `fika-editor`

Publish only through the GitHub Actions workflow [Release and Publish to npm](../.github/workflows/release.yml). That job uses npm Trusted Publishing (OIDC) on a GitHub-hosted runner. Local `npm publish` / `bun publish` is not a release path.

On npmjs.com → `fika-editor` → Settings → Trusted publishing, the GitHub Actions publisher must match:

- Owner: `lofcz`
- Repository: `fika`
- Workflow filename: `release.yml`
- Environment: leave empty unless this workflow later sets `environment:`

Do not store an `NPM_TOKEN` for publish. The workflow requests `id-token: write` and publishes with no auth token so npm exchanges the OIDC token.

Release commits, tags, and GitHub releases are authored by the `fika-bot` GitHub App (mug logo). Store `FIKA_BOT_CLIENT_ID` as a repository variable and `FIKA_BOT_PRIVATE_KEY` as a repository secret. Do not commit the `.pem`.

The published tarball is the prebuilt embed (`dist/embed` + `dist/types`). `dist/` stays gitignored; the workflow runs `build:embed`, packs with the npm next to Node (not Bun's PATH shim), verifies that `.tgz` with `tar`, then publishes the same file. `prepack` / `prepublishOnly` refuse a docs-only tarball if those artifacts are missing.
