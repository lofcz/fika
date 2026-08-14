import type { ElementSource, PPTElement, Slide } from '@/types/slides';
export type ImportDisposition = 'modeled' | 'approximated' | 'opaque' | 'dropped';
export interface ImportDiagnosticItem {
  disposition: ImportDisposition;
  capability: string;
  detail?: string;
  slideIndex?: number;
  elementId?: string;
}
export interface ImportDiagnosticsReport {
  status: 'complete' | 'complete-with-approximations' | 'partial';
  packageId?: string;
  slideCount: number;
  elementCount: number;
  provenanceMatched: number;
  items: ImportDiagnosticItem[];
  summary: Record<ImportDisposition, number>;
}
let lastImportDiagnostics: ImportDiagnosticsReport | null = null;
export function setLastImportDiagnostics(report: ImportDiagnosticsReport | null) {
  lastImportDiagnostics = report;
}
export function getLastImportDiagnostics(): ImportDiagnosticsReport | null {
  return lastImportDiagnostics;
}
export interface BuildImportDiagnosticsInput {
  slides: Slide[];
  packageId?: string;
  /** pptxtojson element type counts that never became Fika elements */
  droppedByType?: Record<string, number>;
  /** Transitions present in OOXML but unmapped */
  unmappedTransitions?: number;
  /** Math nodes imported as images because latex was empty */
  mathFallbackImages?: number;
  /** Layout elements flattened into slide (not preserved as masters) */
  flattenedLayoutElements?: number;
}
function bump(summary: Record<ImportDisposition, number>, disposition: ImportDisposition) {
  summary[disposition] += 1;
}

/**
 * Build a Mona-style import diagnostics matrix for a converted deck.
 */
export function buildImportDiagnosticsReport(input: BuildImportDiagnosticsInput): ImportDiagnosticsReport {
  const items: ImportDiagnosticItem[] = [];
  const summary: Record<ImportDisposition, number> = {
    modeled: 0,
    approximated: 0,
    opaque: 0,
    dropped: 0
  };
  let provenanceMatched = 0;
  let elementCount = 0;
  input.slides.forEach((slide, slideIndex) => {
    if (slide.turningMode) {
      items.push({
        disposition: 'modeled',
        capability: 'transition',
        detail: slide.turningMode,
        slideIndex
      });
      bump(summary, 'modeled');
    }
    if (slide.animations?.length) {
      items.push({
        disposition: 'modeled',
        capability: 'element-animations',
        detail: `${slide.animations.length} effect(s)`,
        slideIndex
      });
      bump(summary, 'modeled');
    }
    if (slide.notes?.length) {
      items.push({
        disposition: 'modeled',
        capability: 'comments',
        detail: `${slide.notes.length} thread(s)`,
        slideIndex
      });
      bump(summary, 'modeled');
    }
    if (slide.remark) {
      items.push({
        disposition: 'modeled',
        capability: 'speaker-notes',
        slideIndex
      });
      bump(summary, 'modeled');
    }
    for (const el of slide.elements) {
      elementCount += 1;
      const source = (el as PPTElement & {
        source?: ElementSource;
      }).source;
      if (source?.objectId) provenanceMatched += 1;
      if (el.type === 'latex') {
        items.push({
          disposition: 'modeled',
          capability: 'equation-latex',
          slideIndex,
          elementId: el.id
        });
        bump(summary, 'modeled');
      }
      if ('effects' in el && el.effects && Object.keys(el.effects).length) {
        items.push({
          disposition: 'modeled',
          capability: 'effects',
          detail: Object.keys(el.effects).join(','),
          slideIndex,
          elementId: el.id
        });
        bump(summary, 'modeled');
      }
      if (el.type === 'text' && el.structuredText?.paragraphs?.length) {
        items.push({
          disposition: 'modeled',
          capability: 'structured-text',
          detail: `${el.structuredText.paragraphs.length} paragraph(s)`,
          slideIndex,
          elementId: el.id
        });
        bump(summary, 'modeled');
      }
      if (el.type === 'chart') {
        items.push({
          disposition: 'approximated',
          capability: 'chart',
          detail: el.chartType,
          slideIndex,
          elementId: el.id
        });
        bump(summary, 'approximated');
      }
    }
  });
  if (input.flattenedLayoutElements) {
    items.push({
      disposition: 'approximated',
      capability: 'master-layout',
      detail: `flattened ${input.flattenedLayoutElements} layout element(s)`
    });
    bump(summary, 'approximated');
  }
  if (input.unmappedTransitions) {
    items.push({
      disposition: 'dropped',
      capability: 'transition',
      detail: `${input.unmappedTransitions} unmapped`
    });
    bump(summary, 'dropped');
  }
  if (input.mathFallbackImages) {
    items.push({
      disposition: 'approximated',
      capability: 'equation-image-fallback',
      detail: `${input.mathFallbackImages} math node(s) without latex`
    });
    bump(summary, 'approximated');
  }
  for (const [type, count] of Object.entries(input.droppedByType || {})) {
    if (!count) continue;
    items.push({
      disposition: 'dropped',
      capability: `element:${type}`,
      detail: `${count}`
    });
    bump(summary, 'dropped');
  }
  if (input.packageId && provenanceMatched > 0) {
    items.push({
      disposition: 'modeled',
      capability: 'provenance',
      detail: `${provenanceMatched}/${elementCount} elements`
    });
    bump(summary, 'modeled');
  }
  const status = summary.dropped > 0 ? 'partial' : summary.approximated > 0 ? 'complete-with-approximations' : 'complete';
  return {
    status,
    packageId: input.packageId,
    slideCount: input.slides.length,
    elementCount,
    provenanceMatched,
    items,
    summary
  };
}
