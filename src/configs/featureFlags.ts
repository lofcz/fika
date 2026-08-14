/**
 * Compile-time feature flags.
 *
 * `EXTRAS_ENABLED` gates demo / upstream-only chrome that has no place in an
 * embedded product build: the GitHub link, the
 * feedback & FAQ links, and the "for testing only" demo disclaimer.
 *
 * The value comes from the `__FIKA_EXTRAS_ENABLED__` constant that Rsbuild
 * replaces at build time (see `rsbuild.config.ts` / `rsbuild.config.embed.ts`). Because
 * it resolves to a literal `true`/`false`, any `if (EXTRAS_ENABLED)` branch is
 * eliminated by the bundler when the flag
 * is off — the default for consumer builds. Enable it with
 * `FIKA_EXTRAS_ENABLED=true` at build time.
 */
export const EXTRAS_ENABLED: boolean = __FIKA_EXTRAS_ENABLED__;
