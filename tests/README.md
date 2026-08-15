# Tests

One command runs everything:

```bash
bun run type-check
bun run test
```

`bun run test` is rstest (`tests/all.test.ts`). It runs unit checks, then the real-browser e2e suites, sequentially.

Presentations live under `tests/fixtures/` — never Desktop or Downloads.

| Path | Deck |
| --- | --- |
| `fixtures/pptx/houby.pptx` | Houby import + fixed-height fit |
| `fixtures/pptx/rizika.pptx` | Text-fit / hanging lists / pictures |
| `fixtures/pptx-import/*` | Import fidelity corpus + `sb1.pptx` |
| `fixtures/fonts/IBMPlexSans-Regular.ttf` | Embedded-font generation |
