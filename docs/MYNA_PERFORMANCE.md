# Myna interaction performance

Measured with `scripts/bench-myna-interactions.mjs`, headless Chromium at 1600 × 1000,
the six-page school showcase, 45 requestAnimationFrame-paced updates per phase. These
are local development measurements, not universal FPS or production latency guarantees.
The baseline includes the previously always-on React Scan overlay; it is now opt-in.

| Interaction | Before p95 frame interval | After p95 frame interval |
| --- | ---: | ---: |
| Canvas pan | 36.6 ms | 19.2 ms |
| Element geometry update | 68 ms | 20.5 ms |
| Section annotation update | 49.2 ms | 16.8 ms |

The stronger regression gates check invalidation rather than timing:

- Element changes cause zero renders in MynaWorkspace, MynaPageCanvas, WorkspaceLabelsCanvas, and WorkspaceObject. Previously they caused 44, 44, 44, and 220 respectively.
- Panning no longer rerenders annotation contents (previously 225 object renders). Its camera projection still updates each frame.
- Changing one section only rerenders that section; the canvas, workspace shell, and page thumbnails remain idle.
- Native text typing and commit leave workspace/layout/annotation roots idle; the edited page's thumbnail remains subscribed.
- Section drag transactions publish member-page positions and section coordinates atomically. Pointer input is coalesced to animation frames and flushed at gesture end; cancellation and undo are covered by browser tests.

Implementation:

- Stable selectors separate page names, layout coordinates, annotations, searchable summaries, and painted artwork. Leaf previews subscribe only to their page's paint-affecting state.
- Camera translation wraps memoized annotation content. The active canvas origin subscribes only to its own page. Layout maps are memoized.
- Frame reconciliation and hierarchy order use indexed, linear traversal instead of repeated full-list searches. DOM clip styles are cached by immutable element-array identity.
- Inspector controls share one store fan-out and revision counter instead of incrementing the revision separately for every subscriber.
- React Scan can be enabled with `?mode=myna&scan=1`; it is off by default.

Run `node scripts/e2e-myna-performance.mjs` to enforce subscription isolation and
`node scripts/e2e-myna-editing-isolation.mjs` for real text input. Both accept
`FIKA_TEST_URL`. Render counters are opt-in and development-only. Raw captures are
in `docs/audits/myna-2026-09-22/perf-before.json` and `perf-after.json`.
