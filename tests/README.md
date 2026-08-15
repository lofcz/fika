# Tests

One command runs everything:

```bash
bun run type-check
bun run test
```

`bun run test` is rstest (`tests/all.test.ts`). It runs unit checks, then the real-browser e2e suites, sequentially.

`scripts/e2e-present-commit-drain.mjs` covers focused/uncommitted text: Present must drain the commit queue so Activity remounts do not lose typed HTML.

`scripts/e2e-slide-mutate.mjs` seeds a 120-slide deck and asserts insert/delete keep other slide identities, stay inside store/UI/agentic budgets, and do not full-repaint the rail. The agentic cases cover streamed `slides.create` / `slides.update` / `elements.update` / `slides.delete` plus `executeBatch`.

`scripts/e2e-agentic-commands.mjs` opens the editor and fires agent-style `execute` / `executeBatch` envelopes for every registered bridge command plus main variants (indexes, dry-run, atomic rollback, missing IDs).

Presentations live under `tests/fixtures/` — never Desktop or Downloads.

| Path | Deck |
| --- | --- |
| `fixtures/pptx/houby.pptx` | Houby import + fixed-height fit |
| `fixtures/pptx/rizika.pptx` | Text-fit / hanging lists / pictures |
| `fixtures/pptx-import/*` | Import fidelity corpus + `sb1.pptx` |
| `fixtures/fonts/IBMPlexSans-Regular.ttf` | Embedded-font generation |
