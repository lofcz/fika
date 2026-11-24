import { beforeEach, describe, expect, it, rs } from '@rstest/core'
import * as actualMath from '@/utils/math' with { rstest: 'importActual' }

rs.mock('@/utils/font', () => ({ collectSlidesFonts: () => [], loadGoogleFonts: () => {} }))
rs.mock('@/utils/math', () => ({
  ...actualMath,
  ensureMathliveReady: async () => {},
  texmathEngine: {
    renderToString: (value: string) => `<span class="fika-math" data-latex="${value}"></span>`,
  },
}))
rs.mock('@/i18n/locale', () => ({ getFikaLocale: () => 'en', setFikaLocale: () => {}, isLocale: () => true }))
rs.mock('@/embed/localeBridge', () => ({ applyLocale: async () => {} }))
rs.mock('@/i18n/getLL', () => ({
  getLL: () => ({
    editor: {
      presentation: { untitled: () => 'Untitled' },
    },
  }),
}))
rs.mock('@/utils/database', () => {
  let nextId = 1
  const rows = new Map<number, Record<string, unknown>>()
  const snapshots = {
    clear: async () => { rows.clear(); nextId = 1 },
    add: async (entry: Record<string, unknown>) => { const id = nextId++; rows.set(id, { ...entry, id }); return id },
    get: async (id: number) => rows.get(id),
    put: async (entry: Record<string, unknown> & { id: number }) => { rows.set(entry.id, { ...entry }); return entry.id },
    update: async (id: number, patch: Record<string, unknown>) => { const prev = rows.get(id); if (prev) rows.set(id, { ...prev, ...patch }); return prev ? 1 : 0 },
    delete: async (id: number) => { rows.delete(id) },
    bulkDelete: async (ids: number[]) => { for (const id of ids) rows.delete(id) },
    orderBy: () => ({
      primaryKeys: async () => [...rows.keys()].sort((a, b) => a - b),
      toArray: async () => [...rows.keys()].sort((a, b) => a - b).map(id => rows.get(id)),
    }),
  }
  return {
    db: {
      snapshots,
      transaction: async (_mode: string, _table: unknown, fn: () => Promise<void>) => fn(),
    },
    deleteDiscardedDB: async () => {},
  }
})

import { createAgenticApi } from '@/embed/agentic/createAgenticApi'
import { useSlidesStore } from '@/store/slides'
import { useSnapshotStore } from '@/store/snapshot'
import type { PPTTextElement } from '@/types/slides'

function seedSlide(elements: PPTTextElement[]) {
  useSlidesStore.getState().setSlides([
    {
      id: 's1',
      background: { type: 'solid', color: '#FFFFFF' },
      elements,
    },
  ])
  useSlidesStore.getState().updateSlideIndex(0)
  useSnapshotStore.setState({ snapshotCursor: -1, snapshotLength: 0 })
}

describe('text.setMarkdown style inheritance', () => {
  beforeEach(() => {
    seedSlide([
      {
        id: 'bullets',
        type: 'text',
        left: 60,
        top: 140,
        width: 880,
        height: 360,
        rotate: 0,
        content: '<ul style="font-size:36px;color:#D25F2B;list-style-position:outside;padding-left:0.4em;margin:0">'
          + '<li><span style="font-size:36px;color:#2B3445;font-family:Lato"><strong>Primární cívka</strong> vytváří proměnné magnetické pole</span></li>'
          + '<li><span style="font-size:36px;color:#2B3445;font-family:Lato">Sekundární cívka indukuje výstupní napětí</span></li>'
          + '</ul>',
        defaultFontName: 'Lato',
        defaultColor: '#2B3445',
      },
      {
        id: 'heading',
        type: 'text',
        left: 60,
        top: 40,
        width: 880,
        height: 80,
        rotate: 0,
        content: '<p style="text-align:left"><span style="font-size:40px;color:#1A2433;font-family:Montserrat"><strong>Transformátory v praxi</strong></span></p>',
        defaultFontName: 'Montserrat',
        defaultColor: '#1A2433',
      },
    ])
  })

  it('preserves 36px font size, font family, text color, and list marker styling (including inline math) without explicit style', async () => {
    const runtime = createAgenticApi()
    const res = await runtime.api.text.setMarkdown(
      'bullets',
      '- Transformační poměr: $\\frac{U_2}{U_1} = \\frac{N_2}{N_1}$\n- **Účinnost** velkých transformátorů přesahuje 98 %',
    )
    expect(res.ok).toBe(true)
    const content = res.data!.content
    expect(content).toContain('<ul style="font-size:36px;color:#D25F2B;list-style-position:outside;padding-left:0.4em;margin:0">')
    expect(content).toContain('<li><span style="font-size:36px;font-family:Lato;color:#2B3445">Transformační poměr: <eq>')
    expect(content).toContain('fika-math')
    expect(content).toContain('<li><span style="font-size:36px;font-family:Lato;color:#2B3445"><strong>Účinnost</strong> velkých transformátorů přesahuje 98 %</span></li>')
    // Partial bold in the original bullet list must NOT wrap the entire new list in <strong>.
    expect(content).not.toContain('<span style="font-size:36px;font-family:Lato;color:#2B3445"><strong>Transformační')
    runtime.stop()
  })

  it('preserves 40px and whole-run bold on headings', async () => {
    const runtime = createAgenticApi()
    const res = await runtime.api.text.setMarkdown('heading', 'Princip indukce')
    expect(res.ok).toBe(true)
    expect(res.data!.content).toBe(
      '<p style="text-align:left"><span style="font-size:40px;font-family:Montserrat;color:#1A2433"><strong>Princip indukce</strong></span></p>',
    )
    runtime.stop()
  })

  it('lets explicit payload.style override inherited properties while keeping unspecified ones', async () => {
    const runtime = createAgenticApi()
    const res = await runtime.api.text.setMarkdown('heading', 'Podnadpis bez tučného písma', {
      style: { fontSize: 28, bold: false, color: '#475569' },
    })
    expect(res.ok).toBe(true)
    expect(res.data!.content).toBe(
      '<p style="text-align:left"><span style="font-size:28px;font-family:Montserrat;color:#475569">Podnadpis bez tučného písma</span></p>',
    )
    expect(res.data!.defaultColor).toBe('#475569')
    expect(res.data!.defaultFontName).toBe('Montserrat')

    const bulletOverride = await runtime.api.text.setMarkdown('bullets', '- Nový bod', {
      style: { fontSize: 24, markerColor: '#0EA5E9' },
    })
    expect(bulletOverride.ok).toBe(true)
    expect(bulletOverride.data!.content).toContain('<ul style="font-size:24px;color:#0EA5E9;list-style-position:outside;padding-left:0.4em;margin:0">')
    expect(bulletOverride.data!.content).toContain('<li><span style="font-size:24px;font-family:Lato;color:#2B3445">Nový bod</span></li>')
    runtime.stop()
  })
})
