# PPTX import fidelity fixtures

Real Office packages used by `bun run test` (import-fidelity + sb1).

| File | Origin |
| --- | --- |
| `corpus-0*.pptx` | [mona-slides-editor](https://github.com/20023136kelyan/mona-slides-editor) public corpus |
| `math-*-after-ppt.pptx` / `math-powerpoint-native.pptx` | PptxGenJS math probes opened/resaved by Microsoft PowerPoint |
| `transitions-comments.pptx` | Generated with `@lofcz/pptxgenjs` (modern `p188` comments + transitions) |
| `sb1.pptx` | PptxGenJS-generated deck from 2026-08-04 (pre-`ce476c07`) that omits `[Content_Types].xml` slide Overrides. Importing it must still yield 7 slides. |

Do not replace these with hand-authored XML stubs — the suite exists to catch real OOXML shapes.
