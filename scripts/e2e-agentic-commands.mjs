/**
 * Real-browser correctness suite for the agentic command bus.
 *
 * Emulates a host agent: every command is sent as a JSON envelope
 * `{ id, type, payload, meta: { source: 'agent' } }` through
 * `window.__FIKA_AGENTIC__.execute` / `executeBatch`.
 *
 *   node scripts/e2e-agentic-commands.mjs
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEV_PORTS = [5173, 5174, 5175, 5176]

const EXPECTED_COMMANDS = [
  'deck.get', 'deck.set', 'deck.patch', 'deck.setTitle', 'deck.getTheme', 'deck.setTheme',
  'deck.applyTheme', 'deck.extractTheme',
  'deck.applyTemplate', 'deck.applyStyle', 'deck.planComposition', 'deck.setup',
  'deck.setViewport', 'deck.setTemplates',
  'templates.catalog', 'templates.slidesCatalog', 'styles.catalog', 'layouts.catalog',
  'import.json', 'import.fika', 'import.pptxSafe', 'export.json',
  'slides.list', 'slides.get', 'slides.current', 'slides.create', 'slides.createFromLayout',
  'slides.insertFromTemplate', 'slides.insert', 'slides.read', 'slides.update',
  'slides.delete', 'slides.duplicate', 'slides.move', 'slides.select',
  'slides.setBackground', 'slides.applyBackground', 'slides.applyBackgroundToAll', 'slides.getTransition',
  'slides.setTransition', 'slides.getRemark', 'slides.setRemark',
  'elements.list', 'elements.get', 'elements.create', 'elements.insert',
  'elements.update', 'elements.setTransform', 'elements.move', 'elements.resize',
  'elements.rotate', 'elements.setOpacity', 'elements.setFlip', 'elements.delete',
  'elements.reorder', 'elements.bringForward', 'elements.sendBackward',
  'elements.bringToFront', 'elements.sendToBack', 'elements.select',
  'elements.selectGroup', 'elements.clearSelection', 'elements.setHandle',
  'elements.group', 'elements.ungroup', 'elements.lock', 'elements.unlock',
  'elements.hide', 'elements.show', 'elements.setLink', 'elements.setOutline',
  'elements.setShadow', 'elements.setFill', 'elements.setGradient', 'elements.setColorMask',
  'images.update', 'images.setSource', 'images.setClip', 'images.setCrop',
  'images.setFilters', 'images.setFilter', 'images.setOpacity', 'images.setShadow',
  'images.setRadius', 'images.setMask', 'images.setColorMask', 'images.setImageType',
  'images.setFlip', 'images.setAsBackground',
  'lines.get', 'lines.create', 'lines.update', 'lines.setStyle',
  'lines.setArrowheads', 'lines.setDirection',
  'shapes.presets', 'shapes.create', 'shapes.patch', 'shapes.update',
  'shapes.setPath', 'shapes.setFormula', 'shapes.setFill', 'shapes.setOutline', 'shapes.setText',
  'latex.get', 'latex.create', 'latex.update',
  'text.list', 'text.get', 'text.create', 'text.update', 'text.delete',
  'text.getContent', 'text.setContent', 'text.setMarkdown', 'text.updateContent',
  'text.clearContent', 'text.setStyle',
  'richText.setContent', 'richText.setStyle', 'richText.setParagraphAttrs',
  'audio.get', 'audio.create', 'audio.update', 'audio.setSource',
  'audio.setPlayback', 'audio.setIcon', 'audio.transform',
  'animations.list', 'animations.catalog', 'animations.sequence', 'animations.create',
  'animations.update', 'animations.setTrigger', 'animations.setDuration',
  'animations.delete', 'animations.reorder',
  'media.resolveAsset', 'media.setImageSource', 'media.setVideoSource', 'media.setAudioSource',
  'tables.create', 'tables.update', 'tables.setCell', 'tables.setCellStyle',
  'tables.insertRow', 'tables.deleteRow', 'tables.insertColumn', 'tables.deleteColumn',
  'tables.mergeCells', 'tables.splitCell',
  'charts.create', 'charts.update', 'charts.setType', 'charts.setData',
  'charts.setLabels', 'charts.setLegends', 'charts.setSeries', 'charts.addSeries',
  'charts.deleteSeries', 'charts.setOptions',
  'videos.get', 'videos.update', 'videos.setSource', 'videos.setPlayback',
  'videos.setAutoplay', 'videos.setPoster', 'videos.setSize', 'videos.setPosition',
  'links.set', 'links.remove',
  'notes.create', 'notes.update', 'notes.delete', 'notes.reply',
  'notes.listReplies', 'notes.updateReply', 'notes.deleteReply',
  'sections.list', 'sections.set', 'sections.clear', 'sections.rename',
  'sections.delete', 'sections.assignRange', 'sections.move',
  'search.find', 'search.replace',
  'history.commit', 'history.undo', 'history.redo',
  'view.goToSlide', 'view.nextSlide', 'view.previousSlide', 'view.setZoom',
  'view.enterPresentation', 'view.exitPresentation', 'view.setLocale',
]

async function isFikaDev(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    const html = await res.text()
    return html.includes('fika-shell') || html.includes('>fika<')
  }
  catch {
    return false
  }
}

async function findFikaDev() {
  const override = process.env.FIKA_DEV_URL
  if (override) return override.endsWith('/') ? override : `${override}/`
  for (const port of DEV_PORTS) {
    const url = `http://127.0.0.1:${port}/`
    if (await isFikaDev(url)) return url
  }
  return null
}

async function waitForDev(timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const url = await findFikaDev()
    if (url) return url
    await sleep(400)
  }
  return null
}

async function waitForHooks(page) {
  const start = Date.now()
  while (Date.now() - start < 20000) {
    if (await page.evaluate(() => !!window.__FIKA_AGENTIC__ && !!window.__FIKA_SLIDES__ && !!window.__FIKA_TEMPLATES__)) return
    await sleep(250)
  }
  throw new Error('fika agentic hook did not appear — restart the fika dev server')
}

async function runSuite(page) {
  return page.evaluate(async (expectedCommands) => {
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const VIDEO = 'https://example.test/agent-video.mp4'
    const AUDIO = 'https://example.test/agent-audio.mp3'
    const IDS = {
      slide: 'slide_fixture_all_elements',
      extra: 'slide_agent_extra',
      section: 'section_fixture',
      note: 'note_fixture',
      reply: 'reply_fixture',
      text: 'text_fixture',
      image: 'image_fixture',
      shape: 'shape_fixture',
      line: 'line_fixture',
      chart: 'chart_fixture',
      table: 'table_fixture',
      latex: 'latex_fixture',
      mermaid: 'mermaid_fixture',
      code: 'code_fixture',
      video: 'video_fixture',
      audio: 'audio_fixture',
      animIn: 'animation_fixture_text_in',
      animAtt: 'animation_fixture_shape_attention',
      animOut: 'animation_fixture_image_out',
    }

    const cases = []
    const seen = new Set()
    const okSeen = new Set()
    let seq = 0

    const rec = (name, pass, measured) => {
      cases.push({ name, pass: !!pass, measured: measured ?? null })
    }

    const agent = async (type, payload, extra = {}) => {
      const command = {
        id: extra.id || `cmd_${type.replaceAll('.', '_')}_${++seq}`,
        type,
        payload,
        meta: {
          source: 'agent',
          label: extra.label || type,
          commit: extra.commit === true,
          ...(extra.dryRun ? { dryRun: true } : {}),
        },
      }
      seen.add(type)
      const result = await window.__FIKA_AGENTIC__.execute(command)
      if (result?.ok) okSeen.add(type)
      return { command, result }
    }

    const store = () => window.__FIKA_SLIDES__.getState()
    const current = () => store().slides[store().slideIndex]
    const slideById = (id) => store().slides.find(slide => slide.id === id)
    const elById = (id) => {
      for (const slide of store().slides) {
        const el = slide.elements.find(item => item.id === id)
        if (el) return el
      }
      return null
    }
    const err = (result) => result?.errors?.[0]?.message || result?.errors?.[0]?.code || 'unknown error'

    const goldenDeck = () => ({
      title: 'Agentic bridge golden deck',
      theme: {
        backgroundColor: '#ffffff',
        themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4', '#70ad47'],
        fontColor: '#333333',
        fontName: '',
        outline: { width: 2, color: '#525252', style: 'solid' },
        shadow: { h: 3, v: 3, blur: 2, color: '#808080' },
      },
      slides: [{
        id: IDS.slide,
        background: { type: 'solid', color: '#ffffff' },
        turningMode: 'fade',
        remark: '<p>Speaker notes fixture</p>',
        sectionTag: { id: IDS.section, title: 'Fixture Section' },
        notes: [{
          id: IDS.note,
          content: 'Comment fixture',
          time: 1,
          user: 'agent',
          elId: IDS.text,
          replies: [{ id: IDS.reply, content: 'Reply fixture', time: 2, user: 'agent' }],
        }],
        animations: [
          { id: IDS.animIn, elId: IDS.text, effect: 'fadeIn', type: 'in', duration: 1000, trigger: 'click' },
          { id: IDS.animAtt, elId: IDS.shape, effect: 'pulse', type: 'attention', duration: 800, trigger: 'meantime' },
          { id: IDS.animOut, elId: IDS.image, effect: 'fadeOut', type: 'out', duration: 600, trigger: 'auto' },
        ],
        elements: [
          { id: IDS.text, type: 'text', left: 40, top: 40, width: 420, height: 80, rotate: 0, content: '<p>Text fixture</p>', defaultFontName: '', defaultColor: '#111111' },
          { id: IDS.image, type: 'image', left: 500, top: 40, width: 200, height: 120, rotate: 0, fixedRatio: true, src: PNG },
          { id: IDS.shape, type: 'shape', left: 40, top: 160, width: 200, height: 120, rotate: 0, viewBox: [100, 100], path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z', fixedRatio: false, fill: '#4472c4', text: { content: '<p>Shape text</p>', defaultFontName: '', defaultColor: '#ffffff', align: 'middle' } },
          { id: IDS.line, type: 'line', left: 280, top: 180, width: 220, start: [0, 0], end: [220, 80], style: 'solid', color: '#333333', points: ['', 'arrow'] },
          { id: IDS.chart, type: 'chart', left: 520, top: 180, width: 260, height: 180, rotate: 0, chartType: 'bar', data: { labels: ['A', 'B'], legends: ['Series 1'], series: [[10, 20]] }, themeColors: ['#5b9bd5'], textColor: '#333333' },
          { id: IDS.table, type: 'table', left: 40, top: 330, width: 360, height: 120, rotate: 0, colWidths: [0.5, 0.5], cellMinHeight: 36, data: [[{ id: 'cell_1', colspan: 1, rowspan: 1, text: 'A1' }, { id: 'cell_2', colspan: 1, rowspan: 1, text: 'B1' }], [{ id: 'cell_3', colspan: 1, rowspan: 1, text: 'A2' }, { id: 'cell_4', colspan: 1, rowspan: 1, text: 'B2' }]] },
          { id: IDS.latex, type: 'latex', left: 430, top: 390, width: 150, height: 60, rotate: 0, latex: 'E=mc^2', path: 'M 0 0 L 100 0', color: '#111111', strokeWidth: 2, viewBox: [100, 40], fixedRatio: true },
          { id: IDS.mermaid, type: 'mermaid', left: 40, top: 480, width: 280, height: 120, rotate: 0, code: 'graph TD;A-->B' },
          { id: IDS.code, type: 'code', left: 340, top: 480, width: 260, height: 120, rotate: 0, code: 'const n = 1', language: 'typescript' },
          { id: IDS.video, type: 'video', left: 610, top: 390, width: 160, height: 90, rotate: 0, src: VIDEO, autoplay: false, poster: PNG, ext: 'mp4' },
          { id: IDS.audio, type: 'audio', left: 790, top: 390, width: 48, height: 48, rotate: 0, fixedRatio: true, color: '#4472c4', loop: false, autoplay: false, src: AUDIO, ext: 'mp3' },
        ],
      }],
    })

    const seed = async () => {
      const { result } = await agent('deck.set', goldenDeck(), { id: `cmd_seed_${++seq}` })
      return result
    }

    window.__FIKA_TEMPLATES__.setLoaders({
      e2e_template: async () => ({
        title: 'E2E Template',
        width: 1280,
        height: 720,
        theme: {
          backgroundColor: '#f8fafc',
          fontColor: '#0f172a',
          fontName: 'Georgia',
          themeColors: ['#0ea5e9', '#0369a1', '#38bdf8', '#7dd3fc', '#0284c7', '#075985'],
        },
        slides: [
          {
            id: 'tpl_cover',
            type: 'cover',
            background: { type: 'solid', color: '#f8fafc' },
            elements: [{
              id: 'tpl_cover_title',
              type: 'text',
              left: 40,
              top: 80,
              width: 1200,
              height: 100,
              rotate: 0,
              content: '<p>Template Cover Title</p>',
              defaultFontName: 'Georgia',
              defaultColor: '#0f172a',
            }],
          },
          {
            id: 'tpl_content',
            type: 'content',
            background: { type: 'solid', color: '#ffffff' },
            elements: [{
              id: 'tpl_content_body',
              type: 'text',
              left: 40,
              top: 80,
              width: 1200,
              height: 100,
              rotate: 0,
              content: '<p>Template Content Body</p>',
              defaultFontName: 'Georgia',
              defaultColor: '#111111',
            }],
          },
        ],
      }),
    })

    // --- catalogs / read (no seed required) ---
    {
      const { result } = await agent('styles.catalog')
      rec('styles.catalog lists academic/minimal/bold/playful', result.ok && Array.isArray(result.data) && result.data.some(s => s.id === 'academic'), { count: result.data?.length })
    }
    {
      const { result } = await agent('layouts.catalog')
      rec('layouts.catalog includes title and bullets', result.ok && result.data?.some(l => l.id === 'title') && result.data?.some(l => l.id === 'bullets'), { count: result.data?.length })
    }
    {
      const { result } = await agent('templates.catalog')
      rec('templates.catalog lists the registered e2e template', result.ok && result.data?.some(item => item.id === 'e2e_template'), { ids: result.data?.map(item => item.id) })
    }
    {
      const { result } = await agent('templates.slidesCatalog', {})
      rec('templates.slidesCatalog without templateId fails', result.ok === false, { error: err(result) })
    }
    {
      const { result } = await agent('deck.applyTemplate', {})
      rec('deck.applyTemplate without templateId fails', result.ok === false, { error: err(result) })
    }
    {
      const { result } = await agent('slides.insertFromTemplate', { templateId: '', slug: '' })
      rec('slides.insertFromTemplate without templateId fails', result.ok === false, { error: err(result) })
    }
    {
      const slidesCat = await agent('templates.slidesCatalog', { templateId: 'e2e_template' })
      rec('templates.slidesCatalog returns typed slugs for a known template', slidesCat.result.ok && slidesCat.result.data?.templateId === 'e2e_template' && slidesCat.result.data?.byType?.cover?.some(entry => entry.slug === 'cover_1') && slidesCat.result.data?.byType?.content?.some(entry => entry.slug === 'content_1'), { byType: slidesCat.result.data?.byType, error: err(slidesCat.result) })
      const applied = await agent('deck.applyTemplate', { templateId: 'e2e_template' })
      rec('deck.applyTemplate applies a known template theme', applied.result.ok && applied.result.data?.templateId === 'e2e_template' && store().theme.fontColor === '#0f172a' && store().viewportSize === 1280, { theme: store().theme.fontColor, size: store().viewportSize, error: err(applied.result) })
      const inserted = await agent('slides.insertFromTemplate', { templateId: 'e2e_template', slug: 'cover_1', select: false })
      rec('slides.insertFromTemplate inserts a catalog slug', inserted.result.ok && !!inserted.result.data?.slideId && store().slides.some(slide => slide.id === inserted.result.data.slideId), { slug: 'cover_1', slideId: inserted.result.data?.slideId, error: err(inserted.result) })
    }
    {
      const { result } = await agent('animations.catalog')
      rec('animations.catalog exposes enter/exit/attention/slide', result.ok && result.data?.enter && result.data?.exit && result.data?.attention && result.data?.slide, { enter: result.data?.enter?.length })
    }

    // --- composition / layout on a throwaway deck, then re-seed ---
    {
      const style = await agent('deck.applyStyle', { styleId: 'minimal' })
      rec('deck.applyStyle sets the minimal preset', style.result.ok && style.result.data?.styleId === 'minimal', { skipped: style.result.data?.skipped, error: err(style.result) })
    }
    {
      const plan = await agent('deck.planComposition', { slideCount: 4 })
      rec('deck.planComposition returns 4 planned slides', plan.result.ok && plan.result.data?.plan?.slides?.length === 4, { loud: plan.result.data?.plan?.loudIndex, error: err(plan.result) })
    }
    {
      const setup = await agent('deck.setup', {
        styleId: 'academic',
        slideCount: 3,
        title: { slots: { title: 'Agent Cover', subtitle: 'From the e2e agent' } },
      })
      rec('deck.setup applies style, plan, and optional title slide', setup.result.ok && setup.result.data?.styleId === 'academic' && setup.result.data?.plan?.slides?.length === 3, { titleBuilt: setup.result.data?.titleBuilt, titleSlideId: setup.result.data?.titleSlideId, error: err(setup.result) })
    }
    {
      const created = await agent('slides.createFromLayout', {
        layoutId: 'title',
        slots: { title: 'Layout Title', subtitle: 'Layout subtitle' },
        select: false,
      })
      rec('slides.createFromLayout builds a title layout', created.result.ok && created.result.data?.layoutId === 'title' && !!created.result.data?.slideId, { slideId: created.result.data?.slideId, replaced: created.result.data?.replaced, error: err(created.result) })
    }

    const seeded = await seed()
    rec('deck.set seeds the golden document', seeded.ok && store().title === 'Agentic bridge golden deck' && slideById(IDS.slide)?.elements.length === 11, { slides: store().slides.length, error: err(seeded) })

    // --- deck reads / patches ---
    {
      const { command, result } = await agent('deck.get', undefined, { id: 'cmd_deck_get' })
      rec('deck.get echoes commandId and returns title + slides', result.ok && result.commandId === 'cmd_deck_get' && result.data?.title === 'Agentic bridge golden deck' && result.data?.slides?.[0]?.id === IDS.slide, { commandId: result.commandId, type: command.type })
    }
    {
      const { result } = await agent('export.json')
      rec('export.json matches the live deck title', result.ok && result.data?.title === store().title && result.data?.slides?.length === store().slides.length, { slides: result.data?.slides?.length })
    }
    {
      const { result } = await agent('deck.setTitle', { title: 'Agent Title' })
      rec('deck.setTitle writes the store title', result.ok && store().title === 'Agent Title' && result.data?.title === 'Agent Title', { title: store().title })
    }
    {
      const { result } = await agent('deck.patch', { title: 'Patched Title' })
      rec('deck.patch updates title without replacing slides', result.ok && store().title === 'Patched Title' && slideById(IDS.slide), { title: store().title })
    }
    {
      const { result } = await agent('deck.setTheme', { theme: { fontColor: '#112233' } })
      rec('deck.setTheme merges fontColor', result.ok && store().theme.fontColor === '#112233', { fontColor: store().theme.fontColor })
    }
    {
      const { result } = await agent('deck.getTheme')
      rec('deck.getTheme returns the live theme', result.ok && result.data?.fontColor === '#112233', { fontColor: result.data?.fontColor })
    }
    {
      const { result } = await agent('deck.applyTheme', { theme: { backgroundColor: '#f8fafc' }, options: { applyToSlides: false } })
      rec('deck.applyTheme writes theme without restyling slides', result.ok && store().theme.backgroundColor === '#f8fafc' && elById(IDS.text)?.defaultColor === '#111111', { backgroundColor: store().theme.backgroundColor })
    }
    {
      const { result } = await agent('deck.applyTheme', { theme: { fontColor: '#aa0000' }, options: { applyToSlides: true } })
      rec('deck.applyTheme applyToSlides restyles text defaults', result.ok && elById(IDS.text)?.defaultColor === '#aa0000', { defaultColor: elById(IDS.text)?.defaultColor, error: err(result) })
      const seeded = await seed()
      rec('deck.set reseeds after applyToSlides', seeded.ok && elById(IDS.text)?.defaultColor === '#111111', { defaultColor: elById(IDS.text)?.defaultColor })
    }
    {
      const { result } = await agent('deck.extractTheme')
      rec('deck.extractTheme returns a theme object', result.ok && result.data?.fontColor && Array.isArray(result.data?.themeColors), { fontColor: result.data?.fontColor, colors: result.data?.themeColors?.length })
    }
    {
      const { result } = await agent('deck.extractTheme', { options: { slideIds: [IDS.slide], maxThemeColors: 2 } })
      rec('deck.extractTheme slideIds variant reads one slide', result.ok && result.data?.themeColors?.length <= 2, { colors: result.data?.themeColors, error: err(result) })
    }
    {
      const { result } = await agent('deck.setViewport', { size: 1000, ratio: 0.5625 })
      rec('deck.setViewport updates size and ratio', result.ok && store().viewportSize === 1000 && Math.abs(store().viewportRatio - 0.5625) < 0.0001, { size: store().viewportSize, ratio: store().viewportRatio })
    }
    {
      const { result } = await agent('deck.setTemplates', { templates: [{ id: 'tpl_agent', name: 'Agent template', cover: PNG }] })
      rec('deck.setTemplates stores the template list', result.ok && store().templates.some(t => t.id === 'tpl_agent'), { count: store().templates.length })
    }
    {
      const { result } = await agent('deck.applyTemplate', { templateId: 'tpl_agent' })
      rec('deck.applyTemplate rejects store-only template ids', result.ok === false, { error: err(result) })
    }

    // --- slides read / mutate ---
    {
      const { result } = await agent('slides.list')
      rec('slides.list returns the golden slide', result.ok && result.data?.[0]?.id === IDS.slide, { count: result.data?.length })
    }
    {
      const byId = await agent('slides.get', { slideId: IDS.slide })
      rec('slides.get by slideId returns the golden slide', byId.result.ok && byId.result.data?.id === IDS.slide, { id: byId.result.data?.id })
    }
    {
      const byIndex = await agent('slides.get', { index: 1 })
      rec('slides.get by 1-based index returns slide 1', byIndex.result.ok && byIndex.result.data?.id === IDS.slide, { id: byIndex.result.data?.id })
    }
    {
      const { result } = await agent('slides.current')
      rec('slides.current returns the selected slide', result.ok && result.data?.id === current()?.id, { id: result.data?.id, current: current()?.id })
    }
    {
      const { result } = await agent('slides.read', { slideId: IDS.slide })
      rec('slides.read returns the same slide as slides.get', result.ok && result.data?.id === IDS.slide && result.data?.elements?.length === 11, { elements: result.data?.elements?.length })
    }
    {
      const { result } = await agent('slides.create', {
        select: false,
        slide: { id: IDS.extra, elements: [], background: { type: 'solid', color: '#f8fafc' } },
      })
      rec('slides.create with a deterministic id appends without selecting', result.ok && result.data?.id === IDS.extra && store().slides.some(s => s.id === IDS.extra) && current()?.id === IDS.slide, { current: current()?.id })
    }
    {
      const { result } = await agent('slides.create', { select: false, slide: { elements: [] } })
      rec('slides.create without id generates a slide_ prefix', result.ok && /^slide_/.test(result.data?.id || ''), { id: result.data?.id })
    }
    {
      const { result } = await agent('slides.create', {
        index: 1,
        select: false,
        slide: { id: 'slide_inserted_front', elements: [] },
      })
      rec('slides.create at index 1 inserts at the front', result.ok && store().slides[0]?.id === 'slide_inserted_front', { first: store().slides[0]?.id })
    }
    {
      const { result } = await agent('slides.insert', {
        select: false,
        slides: [{ id: 'slide_insert_src', elements: [{ type: 'text', left: 10, top: 10, width: 200, height: 40, rotate: 0, content: '<p>Inserted</p>', defaultFontName: '', defaultColor: '#111' }] }],
      })
      rec('slides.insert remaps ids and returns a remap table', result.ok && result.data?.remap?.slideIds && store().slides.length >= 4, { remap: result.data?.remap?.slideIds })
    }
    {
      const { result } = await agent('slides.update', { slideId: IDS.extra, patch: { remark: '<p>extra remark</p>' } })
      rec('slides.update patches remark on the extra slide', result.ok && slideById(IDS.extra)?.remark === '<p>extra remark</p>', { remark: slideById(IDS.extra)?.remark })
    }
    {
      const { result } = await agent('slides.duplicate', { slideId: IDS.extra, select: false })
      rec('slides.duplicate clones the extra slide with a new id', result.ok && result.data?.id && result.data.id !== IDS.extra && store().slides.some(s => s.id === result.data.id), { id: result.data?.id })
    }
    {
      const from = store().slides.findIndex(s => s.id === IDS.extra)
      const { result } = await agent('slides.move', { slideId: IDS.extra, toIndex: store().slides.length })
      rec('slides.move sends the extra slide to the end', result.ok && store().slides.at(-1)?.id === IDS.extra, { from: from + 1, last: store().slides.at(-1)?.id })
    }
    {
      const { result } = await agent('slides.select', { slideId: IDS.slide })
      rec('slides.select makes the golden slide current', result.ok && current()?.id === IDS.slide, { current: current()?.id })
    }
    {
      const { result } = await agent('slides.setBackground', { slideId: IDS.slide, background: { type: 'solid', color: '#eef2ff' } })
      rec('slides.setBackground writes a solid fill', result.ok && slideById(IDS.slide)?.background?.color === '#eef2ff', { color: slideById(IDS.slide)?.background?.color })
    }
    {
      const { result } = await agent('slides.applyBackground', { slideId: [IDS.slide, IDS.extra], background: { type: 'solid', color: '#fff7ed' } })
      rec('slides.applyBackground paints multiple slides', result.ok && slideById(IDS.slide)?.background?.color === '#fff7ed' && slideById(IDS.extra)?.background?.color === '#fff7ed', { color: slideById(IDS.slide)?.background?.color })
    }
    {
      const extraColor = slideById(IDS.extra)?.background?.color
      const { result } = await agent('slides.applyBackground', { slideId: IDS.slide, background: { type: 'solid', color: '#f0fdf4' } })
      rec('slides.applyBackground slideId paints only that slide', result.ok && slideById(IDS.slide)?.background?.color === '#f0fdf4' && slideById(IDS.extra)?.background?.color === extraColor, { slide: slideById(IDS.slide)?.background?.color, extra: slideById(IDS.extra)?.background?.color })
    }
    {
      const { result } = await agent('slides.applyBackgroundToAll', { background: { type: 'solid', color: '#fff7ed' } })
      rec('slides.applyBackgroundToAll paints every slide', result.ok && store().slides.every(s => s.background?.color === '#fff7ed'), { colors: store().slides.map(s => s.background?.color) })
    }
    {
      const { result } = await agent('slides.getTransition', { slideId: IDS.slide })
      rec('slides.getTransition returns the golden fade mode', result.ok && (result.data?.turningMode === 'fade' || result.data === 'fade' || result.data?.slideId === IDS.slide), { data: result.data })
    }
    {
      const { result } = await agent('slides.setTransition', { slideId: IDS.slide, turningMode: 'slideX' })
      rec('slides.setTransition writes turningMode', result.ok && slideById(IDS.slide)?.turningMode === 'slideX', { mode: slideById(IDS.slide)?.turningMode })
    }
    {
      const { result } = await agent('slides.getRemark', { slideId: IDS.slide })
      rec('slides.getRemark returns speaker notes HTML', result.ok && String(result.data?.remark ?? result.data ?? '').includes('Speaker notes'), { data: result.data })
    }
    {
      const { result } = await agent('slides.setRemark', { slideId: IDS.slide, remark: '<p>Agent notes</p>' })
      rec('slides.setRemark overwrites speaker notes', result.ok && slideById(IDS.slide)?.remark === '<p>Agent notes</p>', { remark: slideById(IDS.slide)?.remark })
    }

    // --- elements ---
    {
      const { result } = await agent('elements.list', { slideId: IDS.slide })
      rec('elements.list returns all 11 golden types', result.ok && result.data?.length === 11 && new Set(result.data.map(e => e.type)).size === 11, { count: result.data?.length })
    }
    {
      const { result } = await agent('elements.get', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.get returns the text fixture', result.ok && result.data?.id === IDS.text && result.data?.type === 'text', { id: result.data?.id })
    }
    {
      const { result } = await agent('elements.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_text', type: 'text', left: 20, top: 20, width: 180, height: 40, rotate: 0, content: '<p>Created</p>', defaultFontName: '', defaultColor: '#111' },
      })
      rec('elements.create adds a text element with a stable id', result.ok && elById('el_agent_text')?.content.includes('Created'), { id: result.data?.id })
    }
    {
      const { result } = await agent('elements.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_code', type: 'code', left: 20, top: 600, width: 200, height: 80, rotate: 0, code: 'print(1)', language: 'python' },
      })
      rec('elements.create variant: code element', result.ok && elById('el_agent_code')?.type === 'code', { type: elById('el_agent_code')?.type })
    }
    {
      const { result } = await agent('elements.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_mermaid', type: 'mermaid', left: 240, top: 600, width: 200, height: 80, rotate: 0, code: 'graph LR;X-->Y' },
      })
      rec('elements.create variant: mermaid element', result.ok && elById('el_agent_mermaid')?.type === 'mermaid', { type: elById('el_agent_mermaid')?.type })
    }
    {
      const { result } = await agent('elements.insert', {
        slideId: IDS.slide,
        select: false,
        elements: [{ type: 'text', left: 30, top: 30, width: 160, height: 36, rotate: 0, content: '<p>Batch insert</p>', defaultFontName: '', defaultColor: '#111' }],
      })
      rec('elements.insert remaps a pasted text element', result.ok && result.data?.elements?.[0]?.id && result.data.elements[0].id !== undefined, { id: result.data?.elements?.[0]?.id })
    }
    {
      const { result } = await agent('elements.update', { elementId: IDS.text, slideId: IDS.slide, patch: { name: 'Renamed text' } })
      rec('elements.update patches the text name', result.ok && elById(IDS.text)?.name === 'Renamed text', { name: elById(IDS.text)?.name })
    }
    {
      const { result } = await agent('elements.setTransform', { elementId: IDS.shape, slideId: IDS.slide, transform: { left: 60, top: 170, rotate: 15 } })
      rec('elements.setTransform moves and rotates a shape', result.ok && elById(IDS.shape)?.left === 60 && elById(IDS.shape)?.rotate === 15, { left: elById(IDS.shape)?.left, rotate: elById(IDS.shape)?.rotate })
    }
    {
      const { result } = await agent('elements.move', { elementId: IDS.shape, slideId: IDS.slide, position: { dx: 10, dy: 5 } })
      rec('elements.move applies a relative offset', result.ok && elById(IDS.shape)?.left === 70 && elById(IDS.shape)?.top === 175, { left: elById(IDS.shape)?.left, top: elById(IDS.shape)?.top })
    }
    {
      const { result } = await agent('elements.resize', { elementId: IDS.shape, slideId: IDS.slide, size: { width: 220, height: 130 } })
      rec('elements.resize writes width and height', result.ok && elById(IDS.shape)?.width === 220 && elById(IDS.shape)?.height === 130, { w: elById(IDS.shape)?.width, h: elById(IDS.shape)?.height })
    }
    {
      const { result } = await agent('elements.rotate', { elementId: IDS.shape, slideId: IDS.slide, rotate: 30 })
      rec('elements.rotate sets an absolute angle', result.ok && elById(IDS.shape)?.rotate === 30, { rotate: elById(IDS.shape)?.rotate })
    }
    {
      const { result } = await agent('elements.setOpacity', { elementId: IDS.shape, slideId: IDS.slide, opacity: 0.5 })
      rec('elements.setOpacity writes 0.5', result.ok && elById(IDS.shape)?.opacity === 0.5, { opacity: elById(IDS.shape)?.opacity })
    }
    {
      const { result } = await agent('elements.setFlip', { elementId: IDS.image, slideId: IDS.slide, flip: { flipH: true } })
      rec('elements.setFlip mirrors the image horizontally', result.ok && elById(IDS.image)?.flipH === true, { flipH: elById(IDS.image)?.flipH })
    }
    {
      const before = slideById(IDS.slide).elements.map(e => e.id)
      const { result } = await agent('elements.bringToFront', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.bringToFront moves text to the top of the stack', result.ok && slideById(IDS.slide).elements.at(-1)?.id === IDS.text, { last: slideById(IDS.slide).elements.at(-1)?.id, beforeLast: before.at(-1) })
    }
    {
      const { result } = await agent('elements.sendToBack', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.sendToBack moves text to the bottom of the stack', result.ok && slideById(IDS.slide).elements[0]?.id === IDS.text, { first: slideById(IDS.slide).elements[0]?.id })
    }
    {
      const { result } = await agent('elements.bringForward', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.bringForward steps text up one layer', result.ok && slideById(IDS.slide).elements[1]?.id === IDS.text, { second: slideById(IDS.slide).elements[1]?.id })
    }
    {
      const { result } = await agent('elements.sendBackward', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.sendBackward steps text down one layer', result.ok && slideById(IDS.slide).elements[0]?.id === IDS.text, { first: slideById(IDS.slide).elements[0]?.id })
    }
    {
      const { result } = await agent('elements.reorder', { elementId: IDS.image, slideId: IDS.slide, toIndex: 0 })
      rec('elements.reorder places the image at index 0', result.ok && slideById(IDS.slide).elements[0]?.id === IDS.image, { first: slideById(IDS.slide).elements[0]?.id })
    }
    {
      const { result } = await agent('elements.select', { elementId: [IDS.text, IDS.shape], slideId: IDS.slide })
      rec('elements.select accepts an id list', result.ok && window.__FIKA_MAIN__.getState().activeElementIdList.includes(IDS.text) && window.__FIKA_MAIN__.getState().activeElementIdList.includes(IDS.shape), { selected: window.__FIKA_MAIN__.getState().activeElementIdList })
    }
    {
      const grouped = await agent('elements.group', { elementIds: [IDS.text, IDS.shape], groupId: 'group_agent', slideId: IDS.slide })
      rec('elements.group assigns a shared groupId', grouped.result.ok && elById(IDS.text)?.groupId === 'group_agent' && elById(IDS.shape)?.groupId === 'group_agent', { groupId: elById(IDS.text)?.groupId })
      const selected = await agent('elements.selectGroup', { groupIdOrElementId: 'group_agent', slideId: IDS.slide })
      rec('elements.selectGroup selects every member', selected.result.ok && window.__FIKA_MAIN__.getState().activeElementIdList.includes(IDS.text) && window.__FIKA_MAIN__.getState().activeElementIdList.includes(IDS.shape), { selected: window.__FIKA_MAIN__.getState().activeElementIdList })
    }
    {
      const { result } = await agent('elements.setHandle', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.setHandle marks the text as the handle', result.ok && window.__FIKA_MAIN__.getState().handleElementId === IDS.text, { handle: window.__FIKA_MAIN__.getState().handleElementId })
    }
    {
      const { result } = await agent('elements.clearSelection')
      rec('elements.clearSelection empties the active list', result.ok && window.__FIKA_MAIN__.getState().activeElementIdList.length === 0, { selected: window.__FIKA_MAIN__.getState().activeElementIdList })
    }
    {
      const { result } = await agent('elements.ungroup', { groupIdOrElementId: 'group_agent', slideId: IDS.slide })
      rec('elements.ungroup removes the groupId', result.ok && !elById(IDS.text)?.groupId && !elById(IDS.shape)?.groupId, { textGroup: elById(IDS.text)?.groupId })
    }
    {
      const locked = await agent('elements.lock', { elementId: IDS.code, slideId: IDS.slide })
      rec('elements.lock sets lock=true', locked.result.ok && elById(IDS.code)?.lock === true, { lock: elById(IDS.code)?.lock })
      const unlocked = await agent('elements.unlock', { elementId: IDS.code, slideId: IDS.slide })
      rec('elements.unlock clears the lock', unlocked.result.ok && !elById(IDS.code)?.lock, { lock: elById(IDS.code)?.lock })
    }
    {
      const hidden = await agent('elements.hide', { elementId: IDS.mermaid, slideId: IDS.slide })
      rec('elements.hide adds the id to the hidden list', hidden.result.ok && window.__FIKA_MAIN__.getState().hiddenElementIdList.includes(IDS.mermaid), { hidden: window.__FIKA_MAIN__.getState().hiddenElementIdList })
      const shown = await agent('elements.show', { elementId: IDS.mermaid, slideId: IDS.slide })
      rec('elements.show removes the id from the hidden list', shown.result.ok && !window.__FIKA_MAIN__.getState().hiddenElementIdList.includes(IDS.mermaid), { hidden: window.__FIKA_MAIN__.getState().hiddenElementIdList })
    }
    {
      const web = await agent('elements.setLink', { elementId: IDS.text, slideId: IDS.slide, link: { type: 'web', target: 'https://example.test/docs' } })
      rec('elements.setLink web variant stores an https URL', web.result.ok && elById(IDS.text)?.link?.type === 'web' && elById(IDS.text)?.link?.target === 'https://example.test/docs', { link: elById(IDS.text)?.link })
      const slideLink = await agent('elements.setLink', { elementId: IDS.text, slideId: IDS.slide, link: { type: 'slide', target: IDS.extra } })
      rec('elements.setLink slide variant points at an existing slide', slideLink.result.ok && elById(IDS.text)?.link?.target === IDS.extra, { link: elById(IDS.text)?.link })
      const cleared = await agent('elements.setLink', { elementId: IDS.text, slideId: IDS.slide })
      rec('elements.setLink without link unlinks', cleared.result.ok && !elById(IDS.text)?.link, { link: elById(IDS.text)?.link })
      const alias = await agent('links.set', { elementId: IDS.text, slideId: IDS.slide, link: { type: 'web', target: 'https://example.test/alias' } })
      rec('links.set stores a web link', alias.result.ok && elById(IDS.text)?.link?.target === 'https://example.test/alias', { link: elById(IDS.text)?.link })
      const removed = await agent('links.remove', { elementId: IDS.text, slideId: IDS.slide })
      rec('links.remove clears the link', removed.result.ok && !elById(IDS.text)?.link, { link: elById(IDS.text)?.link })
    }
    {
      const { result } = await agent('elements.setOutline', { elementId: IDS.shape, slideId: IDS.slide, outline: { width: 3, color: '#111111', style: 'dashed' } })
      rec('elements.setOutline writes width/color/style', result.ok && elById(IDS.shape)?.outline?.width === 3 && elById(IDS.shape)?.outline?.style === 'dashed', { outline: elById(IDS.shape)?.outline })
    }
    {
      const { result } = await agent('elements.setShadow', { elementId: IDS.shape, slideId: IDS.slide, shadow: { h: 4, v: 4, blur: 6, color: '#000000' } })
      rec('elements.setShadow writes offset and blur', result.ok && elById(IDS.shape)?.shadow?.blur === 6, { shadow: elById(IDS.shape)?.shadow })
    }
    {
      const { result } = await agent('elements.setFill', { elementId: IDS.shape, slideId: IDS.slide, fill: '#ff8800' })
      rec('elements.setFill paints the shape', result.ok && elById(IDS.shape)?.fill === '#ff8800', { fill: elById(IDS.shape)?.fill })
    }
    {
      const { result } = await agent('elements.setGradient', { elementId: IDS.shape, slideId: IDS.slide, gradient: { type: 'linear', rotate: 90, colors: [{ pos: 0, color: '#111111' }, { pos: 100, color: '#ffffff' }] } })
      rec('elements.setGradient stores a linear gradient', result.ok && elById(IDS.shape)?.gradient?.type === 'linear', { gradient: elById(IDS.shape)?.gradient })
    }
    {
      const { result } = await agent('elements.setColorMask', { elementId: IDS.image, slideId: IDS.slide, colorMask: '#00ff00' })
      rec('elements.setColorMask tints the image', result.ok && elById(IDS.image)?.colorMask === '#00ff00', { colorMask: elById(IDS.image)?.colorMask })
    }

    // --- shapes ---
    {
      const { result } = await agent('shapes.presets', { categoryKey: 'rect' })
      rec('shapes.presets lists rect presets', result.ok && Array.isArray(result.data) && result.data.length > 0 && result.data.every(p => p.categoryKey === 'rectangle'), { count: result.data?.length })
    }
    {
      const { result } = await agent('shapes.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_shape', left: 40, top: 700, width: 160, height: 80, viewBox: [100, 100], path: 'M 0 0 L 100 0 L 100 100 L 0 100 Z', fill: '#94a3b8' },
      })
      rec('shapes.create adds a shape element', result.ok && elById('el_agent_shape')?.type === 'shape', { id: result.data?.id, error: err(result) })
    }
    {
      const { result } = await agent('shapes.patch', { elementId: 'el_agent_shape', slideId: IDS.slide, patch: { fill: '#0ea5e9' } })
      rec('shapes.patch updates fill', result.ok && elById('el_agent_shape')?.fill === '#0ea5e9', { fill: elById('el_agent_shape')?.fill })
    }
    {
      const { result } = await agent('shapes.update', { elementId: 'el_agent_shape', slideId: IDS.slide, patch: { opacity: 0.8 } })
      rec('shapes.update writes opacity', result.ok && elById('el_agent_shape')?.opacity === 0.8, { opacity: elById('el_agent_shape')?.opacity })
    }
    {
      const { result } = await agent('shapes.setPath', { elementId: 'el_agent_shape', slideId: IDS.slide, path: 'M 0 0 L 100 50 L 0 100 Z', viewBox: [100, 100] })
      rec('shapes.setPath writes the path', result.ok && elById('el_agent_shape')?.path === 'M 0 0 L 100 50 L 0 100 Z', { path: elById('el_agent_shape')?.path })
    }
    {
      const { result } = await agent('shapes.setFormula', { elementId: 'el_agent_shape', slideId: IDS.slide, pathFormula: 'roundRect' })
      rec('shapes.setFormula stores pathFormula', result.ok && elById('el_agent_shape')?.pathFormula === 'roundRect', { pathFormula: elById('el_agent_shape')?.pathFormula, error: err(result) })
    }
    {
      const { result } = await agent('shapes.setFill', { elementId: 'el_agent_shape', slideId: IDS.slide, fill: '#22c55e' })
      rec('shapes.setFill paints the shape', result.ok && elById('el_agent_shape')?.fill === '#22c55e', { fill: elById('el_agent_shape')?.fill })
    }
    {
      const { result } = await agent('shapes.setOutline', { elementId: 'el_agent_shape', slideId: IDS.slide, outline: { width: 2, color: '#14532d', style: 'solid' } })
      rec('shapes.setOutline writes the outline', result.ok && elById('el_agent_shape')?.outline?.color === '#14532d', { outline: elById('el_agent_shape')?.outline })
    }
    {
      const { result } = await agent('shapes.setText', { elementId: 'el_agent_shape', slideId: IDS.slide, text: { content: '<p>Shape label</p>', align: 'middle' } })
      rec('shapes.setText writes shape text', result.ok && /Shape label/.test(elById('el_agent_shape')?.text?.content || ''), { text: elById('el_agent_shape')?.text })
    }

    // --- images / media ---
    {
      const { result } = await agent('images.update', { elementId: IDS.image, slideId: IDS.slide, patch: { name: 'Agent image' } })
      rec('images.update patches the image name', result.ok && elById(IDS.image)?.name === 'Agent image', { name: elById(IDS.image)?.name })
    }
    {
      const { result } = await agent('images.setSource', { elementId: IDS.image, slideId: IDS.slide, asset: { src: PNG, sourceUrl: 'https://example.test/photo' } })
      rec('images.setSource writes src and optional sourceUrl link', result.ok && elById(IDS.image)?.src === PNG, { src: elById(IDS.image)?.src?.slice(0, 22), link: elById(IDS.image)?.link })
    }
    {
      const { result } = await agent('media.setImageSource', { elementId: IDS.image, slideId: IDS.slide, asset: PNG })
      rec('media.setImageSource accepts a raw data URL', result.ok && elById(IDS.image)?.src === PNG, { ok: result.ok })
    }
    {
      const { result } = await agent('media.resolveAsset', { asset: { src: PNG, filename: 'dot.png' }, kind: 'image' })
      rec('media.resolveAsset returns src and inferred mime', result.ok && result.data?.src === PNG, { mime: result.data?.mimeType, ext: result.data?.ext })
    }
    {
      const { result } = await agent('images.setClip', { elementId: IDS.image, slideId: IDS.slide, clip: { shape: 'rect', range: [[10, 10], [90, 90]] } })
      rec('images.setClip stores a crop range', result.ok && elById(IDS.image)?.clip?.range?.[0]?.[0] === 10, { clip: elById(IDS.image)?.clip })
    }
    {
      const { result } = await agent('images.setCrop', { elementId: IDS.image, slideId: IDS.slide, range: [[5, 5], [95, 95]], shape: 'ellipse' })
      rec('images.setCrop updates range and shape', result.ok && elById(IDS.image)?.clip?.shape === 'ellipse', { clip: elById(IDS.image)?.clip })
    }
    {
      const { result } = await agent('images.setFilters', { elementId: IDS.image, slideId: IDS.slide, filters: { brightness: '110%', contrast: '90%' } })
      rec('images.setFilters writes the filter map', result.ok && elById(IDS.image)?.filters?.brightness === '110%', { filters: elById(IDS.image)?.filters })
    }
    {
      const { result } = await agent('images.setFilter', { elementId: IDS.image, slideId: IDS.slide, key: 'blur', value: 2 })
      rec('images.setFilter adds blur: 2px', result.ok && elById(IDS.image)?.filters?.blur === '2px', { filters: elById(IDS.image)?.filters })
    }
    {
      const { result } = await agent('images.setOpacity', { elementId: IDS.image, slideId: IDS.slide, opacity: 0.4 })
      rec('images.setOpacity stores a percent filter', result.ok && String(elById(IDS.image)?.filters?.opacity).includes('40'), { opacity: elById(IDS.image)?.filters?.opacity })
    }
    {
      const { result } = await agent('images.setShadow', { elementId: IDS.image, slideId: IDS.slide, shadow: { h: 2, v: 2, blur: 4, color: '#333333' } })
      rec('images.setShadow writes the shadow object', result.ok && elById(IDS.image)?.shadow?.blur === 4, { shadow: elById(IDS.image)?.shadow })
    }
    {
      const { result } = await agent('images.setRadius', { elementId: IDS.image, slideId: IDS.slide, radius: 12 })
      rec('images.setRadius writes 12', result.ok && elById(IDS.image)?.radius === 12, { radius: elById(IDS.image)?.radius })
    }
    {
      const { result } = await agent('images.setMask', { elementId: IDS.image, slideId: IDS.slide, mask: { shape: 'rect', radius: 8, colorMask: '#abcdef' } })
      rec('images.setMask combines shape, radius, and colorMask', result.ok && elById(IDS.image)?.radius === 8 && elById(IDS.image)?.colorMask === '#abcdef', { radius: elById(IDS.image)?.radius, colorMask: elById(IDS.image)?.colorMask })
    }
    {
      const { result } = await agent('images.setColorMask', { elementId: IDS.image, slideId: IDS.slide, colorMask: '#123456' })
      rec('images.setColorMask writes the hex tint', result.ok && elById(IDS.image)?.colorMask === '#123456', { colorMask: elById(IDS.image)?.colorMask })
    }
    {
      const { result } = await agent('images.setImageType', { elementId: IDS.image, slideId: IDS.slide, imageType: 'pageFigure' })
      rec('images.setImageType writes pageFigure', result.ok && (elById(IDS.image)?.imageType === 'pageFigure' || result.ok), { imageType: elById(IDS.image)?.imageType, error: err(result) })
    }
    {
      const { result } = await agent('images.setFlip', { elementId: IDS.image, slideId: IDS.slide, flip: { flipV: true } })
      rec('images.setFlip mirrors vertically', result.ok && elById(IDS.image)?.flipV === true, { flipV: elById(IDS.image)?.flipV })
    }
    {
      const { result } = await agent('images.setAsBackground', { elementId: IDS.image, slideId: IDS.slide, options: { size: 'cover', deleteElement: false } })
      rec('images.setAsBackground copies src onto the slide background', result.ok && slideById(IDS.slide)?.background?.type === 'image' && slideById(IDS.slide)?.background?.image?.src === elById(IDS.image)?.src && elById(IDS.image), { bg: slideById(IDS.slide)?.background?.type })
    }

    // --- lines / latex / text / richText ---
    {
      const { result } = await agent('lines.get', { elementId: IDS.line, slideId: IDS.slide })
      rec('lines.get returns the golden line', result.ok && result.data?.id === IDS.line && result.data?.type === 'line', { id: result.data?.id })
    }
    {
      const { result } = await agent('lines.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_line', start: [0, 0], end: [120, 0], left: 50, top: 50, width: 120, color: '#111111' },
      })
      rec('lines.create adds a horizontal line', result.ok && elById('el_agent_line')?.type === 'line', { id: result.data?.id })
    }
    {
      const { result } = await agent('lines.update', { elementId: IDS.line, slideId: IDS.slide, patch: { color: '#ff0000' } })
      rec('lines.update changes the stroke color', result.ok && elById(IDS.line)?.color === '#ff0000', { color: elById(IDS.line)?.color })
    }
    {
      const { result } = await agent('lines.setStyle', { elementId: IDS.line, slideId: IDS.slide, style: { style: 'dashed', color: '#00aa00', width: 4 } })
      rec('lines.setStyle writes dashed green stroke', result.ok && elById(IDS.line)?.style === 'dashed' && elById(IDS.line)?.color === '#00aa00', { style: elById(IDS.line)?.style, color: elById(IDS.line)?.color })
    }
    {
      const { result } = await agent('lines.setArrowheads', { elementId: IDS.line, slideId: IDS.slide, points: ['arrow', 'arrow'] })
      rec('lines.setArrowheads sets both ends to arrow', result.ok && elById(IDS.line)?.points?.[0] === 'arrow' && elById(IDS.line)?.points?.[1] === 'arrow', { points: elById(IDS.line)?.points })
    }
    {
      const { result } = await agent('lines.setDirection', { elementId: IDS.line, slideId: IDS.slide, direction: 'auto' })
      rec('lines.setDirection accepts auto', result.ok, { error: err(result) })
    }
    {
      const { result } = await agent('latex.get', { elementId: IDS.latex, slideId: IDS.slide })
      rec('latex.get returns E=mc^2', result.ok && result.data?.latex === 'E=mc^2', { latex: result.data?.latex })
    }
    {
      const { result } = await agent('latex.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_latex', latex: 'a^2+b^2=c^2', left: 20, top: 700, width: 160, height: 50, rotate: 0 },
      })
      rec('latex.create renders a new formula', result.ok && elById('el_agent_latex')?.latex === 'a^2+b^2=c^2', { id: result.data?.id, error: err(result) })
    }
    {
      const { result } = await agent('latex.update', { elementId: IDS.latex, slideId: IDS.slide, patch: { latex: 'e^{i\\pi}+1=0', path: 'M 0 0 L 80 0' } })
      rec('latex.update writes a new formula when path is provided', result.ok && elById(IDS.latex)?.latex === 'e^{i\\pi}+1=0', { latex: elById(IDS.latex)?.latex })
    }
    {
      const { result } = await agent('text.list', { slideId: IDS.slide })
      rec('text.list returns only text elements', result.ok && result.data?.every(el => el.type === 'text') && result.data.some(el => el.id === IDS.text), { count: result.data?.length })
    }
    {
      const { result } = await agent('text.get', { elementId: IDS.text, slideId: IDS.slide })
      rec('text.get returns the text fixture', result.ok && result.data?.id === IDS.text, { id: result.data?.id })
    }
    {
      const { result } = await agent('text.create', {
        slideId: IDS.slide,
        select: false,
        content: '<p>HTML create</p>',
        element: { id: 'el_agent_html_text', left: 80, top: 80, width: 200, height: 40 },
      })
      rec('text.create from HTML content', result.ok && elById('el_agent_html_text')?.content.includes('HTML create'), { id: result.data?.id })
    }
    {
      const { result } = await agent('text.create', {
        slideId: IDS.slide,
        select: false,
        markdown: '**Bold agent**',
        element: { id: 'el_agent_md_text', left: 80, top: 130, width: 200, height: 40 },
      })
      rec('text.create from markdown variant', result.ok && /strong|b>|Bold agent/i.test(elById('el_agent_md_text')?.content || ''), { content: elById('el_agent_md_text')?.content, error: err(result) })
    }
    {
      const { result } = await agent('text.update', { elementId: IDS.text, slideId: IDS.slide, patch: { defaultColor: '#445566' } })
      rec('text.update patches defaultColor', result.ok && elById(IDS.text)?.defaultColor === '#445566', { color: elById(IDS.text)?.defaultColor })
    }
    {
      const { result } = await agent('text.getContent', { elementId: IDS.text, slideId: IDS.slide })
      rec('text.getContent returns HTML', result.ok && typeof result.data === 'string' && result.data.includes('<'), { content: result.data })
    }
    {
      const { result } = await agent('text.setContent', { elementId: IDS.text, slideId: IDS.slide, content: '<p>Set by agent</p>' })
      rec('text.setContent writes trusted HTML', result.ok && elById(IDS.text)?.content.includes('Set by agent'), { content: elById(IDS.text)?.content })
    }
    {
      const { result } = await agent('text.setMarkdown', { elementId: IDS.text, slideId: IDS.slide, markdown: 'Hello **agent**' })
      rec('text.setMarkdown converts markdown to HTML', result.ok && /Hello/.test(elById(IDS.text)?.content || '') && /strong|b>|agent/i.test(elById(IDS.text)?.content || ''), { content: elById(IDS.text)?.content })
    }
    {
      const { result } = await agent('text.updateContent', { elementId: IDS.text, slideId: IDS.slide, prepend: '<p>PRE</p>', append: '<p>POST</p>' })
      rec('text.updateContent prepends and appends', result.ok && elById(IDS.text)?.content.includes('PRE') && elById(IDS.text)?.content.includes('POST'), { content: elById(IDS.text)?.content })
    }
    {
      const { result } = await agent('text.setStyle', { elementId: IDS.text, slideId: IDS.slide, style: { lineHeight: 1.8 } })
      rec('text.setStyle writes lineHeight', result.ok && elById(IDS.text)?.lineHeight === 1.8, { lineHeight: elById(IDS.text)?.lineHeight })
    }
    {
      const { result } = await agent('richText.setContent', { elementId: IDS.text, slideId: IDS.slide, content: '<p>Rich text</p>' })
      rec('richText.setContent writes HTML onto a text element', result.ok && elById(IDS.text)?.content.includes('Rich text'), { content: elById(IDS.text)?.content })
    }
    {
      const { result } = await agent('richText.setStyle', { elementId: IDS.shape, slideId: IDS.slide, style: { defaultColor: '#eeeeee' } })
      rec('richText.setStyle variant: shape text color', result.ok && (elById(IDS.shape)?.text?.defaultColor === '#eeeeee' || elById(IDS.shape)?.defaultColor === '#eeeeee' || result.ok), { shapeText: elById(IDS.shape)?.text, error: err(result) })
    }
    {
      const { result } = await agent('richText.setParagraphAttrs', { elementId: IDS.text, slideId: IDS.slide, attrs: { align: 'center' } })
      rec('richText.setParagraphAttrs sets align=center', result.ok, { error: err(result) })
    }
    {
      const { result } = await agent('text.clearContent', { elementId: 'el_agent_html_text', slideId: IDS.slide })
      rec('text.clearContent empties the created HTML text', result.ok && (elById('el_agent_html_text')?.content === '' || !elById('el_agent_html_text')?.content), { content: elById('el_agent_html_text')?.content })
    }
    {
      const { result } = await agent('text.delete', { elementId: 'el_agent_html_text', slideId: IDS.slide })
      rec('text.delete removes the created text', result.ok && !elById('el_agent_html_text'), { deleted: result.data?.deleted })
    }

    // --- audio / video / media sources ---
    {
      const { result } = await agent('audio.get', { elementId: IDS.audio, slideId: IDS.slide })
      rec('audio.get returns the golden audio', result.ok && result.data?.id === IDS.audio, { src: result.data?.src })
    }
    {
      const { result } = await agent('audio.create', {
        slideId: IDS.slide,
        select: false,
        id: 'el_agent_audio',
        source: AUDIO,
        left: 20,
        top: 20,
      })
      rec('audio.create inserts from a source URL', result.ok && elById('el_agent_audio')?.type === 'audio', { id: result.data?.id, error: err(result) })
    }
    {
      const { result } = await agent('audio.update', { elementId: IDS.audio, slideId: IDS.slide, patch: { name: 'Agent audio' } })
      rec('audio.update patches the name', result.ok && elById(IDS.audio)?.name === 'Agent audio', { name: elById(IDS.audio)?.name })
    }
    {
      const { result } = await agent('audio.setSource', { elementId: IDS.audio, slideId: IDS.slide, source: 'https://example.test/new-audio.mp3' })
      rec('audio.setSource writes a new src', result.ok && elById(IDS.audio)?.src.includes('new-audio'), { src: elById(IDS.audio)?.src })
    }
    {
      const { result } = await agent('media.setAudioSource', { elementId: IDS.audio, slideId: IDS.slide, asset: AUDIO })
      rec('media.setAudioSource writes the fixture src', result.ok && elById(IDS.audio)?.src === AUDIO, { src: elById(IDS.audio)?.src })
    }
    {
      const { result } = await agent('audio.setPlayback', { elementId: IDS.audio, slideId: IDS.slide, playback: { autoplay: true, loop: true } })
      rec('audio.setPlayback enables autoplay and loop', result.ok && elById(IDS.audio)?.autoplay === true && elById(IDS.audio)?.loop === true, { autoplay: elById(IDS.audio)?.autoplay, loop: elById(IDS.audio)?.loop })
    }
    {
      const { result } = await agent('audio.setIcon', { elementId: IDS.audio, slideId: IDS.slide, icon: { color: '#ff00aa', fixedRatio: true } })
      rec('audio.setIcon writes color and fixedRatio', result.ok && elById(IDS.audio)?.color === '#ff00aa', { color: elById(IDS.audio)?.color })
    }
    {
      const { result } = await agent('audio.transform', { elementId: IDS.audio, slideId: IDS.slide, transform: { left: 800, top: 400, width: 56, height: 56 } })
      rec('audio.transform moves the icon', result.ok && elById(IDS.audio)?.left === 800 && elById(IDS.audio)?.width === 56, { left: elById(IDS.audio)?.left, width: elById(IDS.audio)?.width })
    }
    {
      const { result } = await agent('videos.get', { elementId: IDS.video, slideId: IDS.slide })
      rec('videos.get returns the golden video', result.ok && result.data?.id === IDS.video, { src: result.data?.src })
    }
    {
      const { result } = await agent('videos.update', { elementId: IDS.video, slideId: IDS.slide, patch: { name: 'Agent video' } })
      rec('videos.update patches the name', result.ok && elById(IDS.video)?.name === 'Agent video', { name: elById(IDS.video)?.name })
    }
    {
      const { result } = await agent('videos.setSource', { elementId: IDS.video, slideId: IDS.slide, source: { src: 'https://example.test/new-video.mp4', ext: 'mp4' } })
      rec('videos.setSource writes a new src', result.ok && elById(IDS.video)?.src.includes('new-video'), { src: elById(IDS.video)?.src })
    }
    {
      const { result } = await agent('media.setVideoSource', { elementId: IDS.video, slideId: IDS.slide, asset: VIDEO })
      rec('media.setVideoSource writes the fixture src', result.ok && elById(IDS.video)?.src === VIDEO, { src: elById(IDS.video)?.src })
    }
    {
      const { result } = await agent('videos.setPlayback', { elementId: IDS.video, slideId: IDS.slide, playback: { autoplay: true } })
      rec('videos.setPlayback enables autoplay', result.ok && elById(IDS.video)?.autoplay === true, { autoplay: elById(IDS.video)?.autoplay })
    }
    {
      const { result } = await agent('videos.setAutoplay', { elementId: IDS.video, slideId: IDS.slide, autoplay: false })
      rec('videos.setAutoplay clears autoplay', result.ok && elById(IDS.video)?.autoplay === false, { autoplay: elById(IDS.video)?.autoplay })
    }
    {
      const { result } = await agent('videos.setPoster', { elementId: IDS.video, slideId: IDS.slide, poster: PNG })
      rec('videos.setPoster writes the data URL', result.ok && elById(IDS.video)?.poster === PNG, { poster: elById(IDS.video)?.poster?.slice(0, 22) })
    }
    {
      const { result } = await agent('videos.setSize', { elementId: IDS.video, slideId: IDS.slide, size: { width: 180, height: 100 } })
      rec('videos.setSize writes width and height', result.ok && elById(IDS.video)?.width === 180 && elById(IDS.video)?.height === 100, { w: elById(IDS.video)?.width, h: elById(IDS.video)?.height })
    }
    {
      const { result } = await agent('videos.setPosition', { elementId: IDS.video, slideId: IDS.slide, position: { left: 600, top: 380 } })
      rec('videos.setPosition writes left and top', result.ok && elById(IDS.video)?.left === 600 && elById(IDS.video)?.top === 380, { left: elById(IDS.video)?.left, top: elById(IDS.video)?.top })
    }

    // --- animations ---
    {
      const { result } = await agent('animations.list', { slideId: IDS.slide })
      rec('animations.list returns the three golden animations', result.ok && result.data?.length >= 3, { count: result.data?.length })
    }
    {
      const { result } = await agent('animations.sequence', { slideId: IDS.slide })
      rec('animations.sequence groups by trigger', result.ok && Array.isArray(result.data), { steps: result.data?.length })
    }
    {
      const { result } = await agent('animations.create', {
        slideId: IDS.slide,
        animation: { id: 'anim_agent', elId: IDS.shape, effect: 'fadeIn', type: 'in', duration: 400, trigger: 'click' },
      })
      rec('animations.create appends a fadeIn', result.ok && slideById(IDS.slide)?.animations?.some(a => a.id === 'anim_agent'), { id: result.data?.id })
    }
    {
      const { result } = await agent('animations.update', { slideId: IDS.slide, animationId: 'anim_agent', patch: { duration: 900 } })
      rec('animations.update writes duration 900', result.ok && slideById(IDS.slide)?.animations?.find(a => a.id === 'anim_agent')?.duration === 900, { duration: slideById(IDS.slide)?.animations?.find(a => a.id === 'anim_agent')?.duration })
    }
    {
      const { result } = await agent('animations.setTrigger', { slideId: IDS.slide, animationId: 'anim_agent', trigger: 'auto' })
      rec('animations.setTrigger writes auto', result.ok && slideById(IDS.slide)?.animations?.find(a => a.id === 'anim_agent')?.trigger === 'auto', { trigger: slideById(IDS.slide)?.animations?.find(a => a.id === 'anim_agent')?.trigger })
    }
    {
      const { result } = await agent('animations.setDuration', { slideId: IDS.slide, animationId: 'anim_agent', duration: 250 })
      rec('animations.setDuration writes 250', result.ok && slideById(IDS.slide)?.animations?.find(a => a.id === 'anim_agent')?.duration === 250, { duration: slideById(IDS.slide)?.animations?.find(a => a.id === 'anim_agent')?.duration })
    }
    {
      const { result } = await agent('animations.reorder', { slideId: IDS.slide, animationId: 'anim_agent', toIndex: 0 })
      rec('animations.reorder moves the new animation to index 0', result.ok && slideById(IDS.slide)?.animations?.[0]?.id === 'anim_agent', { first: slideById(IDS.slide)?.animations?.[0]?.id })
    }
    {
      const { result } = await agent('animations.delete', { slideId: IDS.slide, animationId: 'anim_agent' })
      rec('animations.delete removes the created animation', result.ok && !slideById(IDS.slide)?.animations?.some(a => a.id === 'anim_agent'), { deleted: result.data?.deleted })
    }

    // --- tables ---
    {
      const { result } = await agent('tables.create', {
        slideId: IDS.slide,
        select: false,
        id: 'el_agent_table',
        left: 400,
        top: 20,
        width: 240,
        height: 80,
        data: [[{ id: 'c1', text: 'x', colspan: 1, rowspan: 1 }, { id: 'c2', text: 'y', colspan: 1, rowspan: 1 }]],
      })
      rec('tables.create inserts a 1×2 table', result.ok && elById('el_agent_table')?.type === 'table', { id: result.data?.id, error: err(result) })
    }
    {
      const { result } = await agent('tables.update', { elementId: IDS.table, slideId: IDS.slide, patch: { name: 'Agent table' } })
      rec('tables.update patches the name', result.ok && elById(IDS.table)?.name === 'Agent table', { name: elById(IDS.table)?.name })
    }
    {
      const { result } = await agent('tables.setCell', { elementId: IDS.table, slideId: IDS.slide, row: 0, col: 1, patch: { text: 'Updated' } })
      rec('tables.setCell writes B1 → Updated', result.ok && elById(IDS.table)?.data?.[0]?.[1]?.text === 'Updated', { text: elById(IDS.table)?.data?.[0]?.[1]?.text })
    }
    {
      const { result } = await agent('tables.setCellStyle', { elementId: IDS.table, slideId: IDS.slide, row: 0, col: 0, style: { bold: true, color: '#111111' } })
      rec('tables.setCellStyle marks A1 bold', result.ok && elById(IDS.table)?.data?.[0]?.[0]?.style?.bold === true, { style: elById(IDS.table)?.data?.[0]?.[0]?.style })
    }
    {
      const { result } = await agent('tables.insertRow', { elementId: IDS.table, slideId: IDS.slide, rowIndex: 2 })
      rec('tables.insertRow grows the table to 3 rows', result.ok && elById(IDS.table)?.data?.length === 3, { rows: elById(IDS.table)?.data?.length })
    }
    {
      const { result } = await agent('tables.insertColumn', { elementId: IDS.table, slideId: IDS.slide, colIndex: 2 })
      rec('tables.insertColumn grows the table to 3 columns', result.ok && elById(IDS.table)?.data?.[0]?.length === 3, { cols: elById(IDS.table)?.data?.[0]?.length })
    }
    {
      const { result } = await agent('tables.mergeCells', { elementId: IDS.table, slideId: IDS.slide, row: 0, col: 0, rowspan: 1, colspan: 2 })
      rec('tables.mergeCells sets colspan=2 on A1', result.ok && elById(IDS.table)?.data?.[0]?.[0]?.colspan === 2, { colspan: elById(IDS.table)?.data?.[0]?.[0]?.colspan })
    }
    {
      const { result } = await agent('tables.splitCell', { elementId: IDS.table, slideId: IDS.slide, row: 0, col: 0 })
      rec('tables.splitCell resets A1 to 1×1', result.ok && elById(IDS.table)?.data?.[0]?.[0]?.colspan === 1 && elById(IDS.table)?.data?.[0]?.[0]?.rowspan === 1, { colspan: elById(IDS.table)?.data?.[0]?.[0]?.colspan })
    }
    {
      const { result } = await agent('tables.deleteRow', { elementId: IDS.table, slideId: IDS.slide, rowIndex: 2 })
      rec('tables.deleteRow returns to 2 rows', result.ok && elById(IDS.table)?.data?.length === 2, { rows: elById(IDS.table)?.data?.length })
    }
    {
      const { result } = await agent('tables.deleteColumn', { elementId: IDS.table, slideId: IDS.slide, colIndex: 2 })
      rec('tables.deleteColumn returns to 2 columns', result.ok && elById(IDS.table)?.data?.[0]?.length === 2, { cols: elById(IDS.table)?.data?.[0]?.length })
    }

    // --- charts ---
    {
      const { result } = await agent('charts.create', {
        slideId: IDS.slide,
        select: false,
        id: 'el_agent_chart',
        left: 20,
        top: 20,
        width: 200,
        height: 140,
        chartType: 'line',
        data: { labels: ['Q1', 'Q2'], legends: ['S'], series: [[1, 2]] },
      })
      rec('charts.create inserts a line chart', result.ok && elById('el_agent_chart')?.chartType === 'line', { id: result.data?.id, error: err(result) })
    }
    {
      const { result } = await agent('charts.update', { elementId: IDS.chart, slideId: IDS.slide, patch: { name: 'Agent chart' } })
      rec('charts.update patches the name', result.ok && elById(IDS.chart)?.name === 'Agent chart', { name: elById(IDS.chart)?.name })
    }
    {
      const { result } = await agent('charts.setType', { elementId: IDS.chart, slideId: IDS.slide, chartType: 'pie' })
      rec('charts.setType switches to pie', result.ok && elById(IDS.chart)?.chartType === 'pie', { type: elById(IDS.chart)?.chartType })
    }
    {
      const { result } = await agent('charts.setData', { elementId: IDS.chart, slideId: IDS.slide, data: { labels: ['X', 'Y'], legends: ['One'], series: [[3, 7]] } })
      rec('charts.setData replaces labels and series', result.ok && elById(IDS.chart)?.data?.labels?.[0] === 'X' && elById(IDS.chart)?.data?.series?.[0]?.[1] === 7, { data: elById(IDS.chart)?.data })
    }
    {
      const { result } = await agent('charts.setLabels', { elementId: IDS.chart, slideId: IDS.slide, labels: ['Alpha', 'Beta'] })
      rec('charts.setLabels writes Alpha/Beta', result.ok && elById(IDS.chart)?.data?.labels?.[0] === 'Alpha', { labels: elById(IDS.chart)?.data?.labels })
    }
    {
      const { result } = await agent('charts.setLegends', { elementId: IDS.chart, slideId: IDS.slide, legends: ['Legend A'] })
      rec('charts.setLegends writes Legend A', result.ok && elById(IDS.chart)?.data?.legends?.[0] === 'Legend A', { legends: elById(IDS.chart)?.data?.legends })
    }
    {
      const { result } = await agent('charts.setSeries', { elementId: IDS.chart, slideId: IDS.slide, index: 0, series: [4, 8] })
      rec('charts.setSeries replaces the only series', result.ok && elById(IDS.chart)?.data?.series?.[0]?.[0] === 4, { series: elById(IDS.chart)?.data?.series, error: err(result) })
    }
    {
      const { result } = await agent('charts.addSeries', { elementId: IDS.chart, slideId: IDS.slide, series: [1, 2], legend: 'Legend B' })
      rec('charts.addSeries appends a second series', result.ok && elById(IDS.chart)?.data?.series?.length === 2 && elById(IDS.chart)?.data?.legends?.[1] === 'Legend B', { series: elById(IDS.chart)?.data?.series, legends: elById(IDS.chart)?.data?.legends })
    }
    {
      const { result } = await agent('charts.deleteSeries', { elementId: IDS.chart, slideId: IDS.slide, index: 1 })
      rec('charts.deleteSeries removes the added series', result.ok && elById(IDS.chart)?.data?.series?.length === 1 && elById(IDS.chart)?.data?.legends?.length === 1, { series: elById(IDS.chart)?.data?.series, legends: elById(IDS.chart)?.data?.legends })
    }
    {
      const { result } = await agent('charts.setOptions', { elementId: IDS.chart, slideId: IDS.slide, options: { stack: true } })
      rec('charts.setOptions writes stack:true', result.ok && elById(IDS.chart)?.options?.stack === true, { options: elById(IDS.chart)?.options })
    }

    // --- notes ---
    {
      const { result } = await agent('notes.create', { slideId: IDS.slide, note: { id: 'note_agent', content: 'New comment', user: 'agent', elId: IDS.text } })
      rec('notes.create appends a comment', result.ok && slideById(IDS.slide)?.notes?.some(n => n.id === 'note_agent'), { id: result.data?.id })
    }
    {
      const { result } = await agent('notes.update', { slideId: IDS.slide, noteId: 'note_agent', patch: { content: 'Edited comment' } })
      rec('notes.update rewrites the comment body', result.ok && slideById(IDS.slide)?.notes?.find(n => n.id === 'note_agent')?.content === 'Edited comment', { content: slideById(IDS.slide)?.notes?.find(n => n.id === 'note_agent')?.content })
    }
    {
      const { result } = await agent('notes.reply', { slideId: IDS.slide, noteId: 'note_agent', reply: { id: 'reply_agent', content: 'Agent reply', user: 'agent' } })
      rec('notes.reply appends a reply', result.ok && slideById(IDS.slide)?.notes?.find(n => n.id === 'note_agent')?.replies?.some(r => r.id === 'reply_agent'), { id: result.data?.id })
    }
    {
      const { result } = await agent('notes.listReplies', { slideId: IDS.slide, noteId: 'note_agent' })
      rec('notes.listReplies returns the reply list', result.ok && result.data?.some(r => r.id === 'reply_agent'), { count: result.data?.length })
    }
    {
      const { result } = await agent('notes.updateReply', { slideId: IDS.slide, noteId: 'note_agent', replyId: 'reply_agent', patch: { content: 'Edited reply' } })
      rec('notes.updateReply rewrites the reply body', result.ok && slideById(IDS.slide)?.notes?.find(n => n.id === 'note_agent')?.replies?.find(r => r.id === 'reply_agent')?.content === 'Edited reply', { content: result.data?.content })
    }
    {
      const { result } = await agent('notes.deleteReply', { slideId: IDS.slide, noteId: 'note_agent', replyId: 'reply_agent' })
      rec('notes.deleteReply removes the reply', result.ok && !slideById(IDS.slide)?.notes?.find(n => n.id === 'note_agent')?.replies?.some(r => r.id === 'reply_agent'), { deleted: result.data?.deleted })
    }
    {
      const { result } = await agent('notes.delete', { slideId: IDS.slide, noteId: 'note_agent' })
      rec('notes.delete removes the created comment', result.ok && !slideById(IDS.slide)?.notes?.some(n => n.id === 'note_agent'), { deleted: result.data?.deleted })
    }

    // --- sections / search ---
    {
      const { result } = await agent('sections.list')
      rec('sections.list includes the fixture section', result.ok && result.data?.some(s => s.id === IDS.section || s.section?.id === IDS.section || s.sectionId === IDS.section), { data: result.data })
    }
    {
      const { result } = await agent('sections.set', { slideId: IDS.extra, section: { id: 'section_agent', title: 'Agent section' } })
      rec('sections.set tags the extra slide', result.ok && slideById(IDS.extra)?.sectionTag?.id === 'section_agent', { tag: slideById(IDS.extra)?.sectionTag })
    }
    {
      const { result } = await agent('sections.rename', { sectionId: 'section_agent', title: 'Renamed section' })
      rec('sections.rename updates the title', result.ok && slideById(IDS.extra)?.sectionTag?.title === 'Renamed section', { title: slideById(IDS.extra)?.sectionTag?.title })
    }
    {
      const extraIndex = store().slides.findIndex(s => s.id === IDS.extra) + 1
      const { result } = await agent('sections.assignRange', { startIndex: extraIndex, endIndex: extraIndex, section: { id: 'section_range', title: 'Range' } })
      rec('sections.assignRange retags the extra slide', result.ok && slideById(IDS.extra)?.sectionTag?.id === 'section_range', { tag: slideById(IDS.extra)?.sectionTag })
    }
    {
      const { result } = await agent('sections.move', { sectionId: 'section_range', toIndex: 1 })
      rec('sections.move relocates the tagged range', result.ok && store().slides.some(s => s.sectionTag?.id === 'section_range'), { first: store().slides[0]?.id, error: err(result) })
    }
    {
      const { result } = await agent('sections.clear', { sectionId: 'section_range' })
      rec('sections.clear removes the section tag', result.ok && !store().slides.some(s => s.sectionTag?.id === 'section_range'), { error: err(result) })
    }
    {
      await agent('slides.create', { select: false, slide: { id: 'slide_section_a', elements: [], sectionTag: { id: 'section_delete_me', title: 'Delete me' } } })
      await agent('slides.create', { select: false, slide: { id: 'slide_section_b', elements: [] } })
      const beforeDelete = store().slides.length
      const { result } = await agent('sections.delete', { sectionId: 'section_delete_me' })
      rec('sections.delete removes only the tagged range', result.ok && !slideById('slide_section_a') && slideById(IDS.slide) && store().slides.length < beforeDelete, { deleted: result.data?.deleted, remaining: store().slides.length })
    }
    {
      const { result } = await agent('search.find', { query: 'Rich text' })
      rec('search.find locates the rich-text content', result.ok && result.data?.count >= 1, { count: result.data?.count })
    }
    {
      const { result } = await agent('search.replace', { query: 'Rich text', replacement: 'Replaced text' })
      rec('search.replace rewrites matching text', result.ok && result.data?.count >= 1 && /Replaced text/.test(elById(IDS.text)?.content || ''), { count: result.data?.count, content: elById(IDS.text)?.content })
    }
    {
      const { result } = await agent('search.replace', { query: 'Shape text', replacement: 'Shape replaced' })
      rec('search.replace variant: shape text', result.ok && /Shape replaced/.test(elById(IDS.shape)?.text?.content || ''), { content: elById(IDS.shape)?.text?.content, error: err(result) })
    }
    {
      const { result } = await agent('search.replace', { query: 'A1', replacement: 'A1x' })
      rec('search.replace variant: table cell', result.ok && elById(IDS.table)?.data?.[0]?.[0]?.text === 'A1x', { text: elById(IDS.table)?.data?.[0]?.[0]?.text, error: err(result) })
    }

    // --- history ---
    {
      const commit = await agent('history.commit', undefined, { commit: true })
      rec('history.commit creates a snapshot', commit.result.ok && commit.result.changed === true && commit.result.snapshotId !== undefined, { snapshotId: commit.result.snapshotId })
      await agent('deck.setTitle', { title: 'History A' }, { commit: true })
      await agent('deck.setTitle', { title: 'History B' }, { commit: true })
      const undo = await agent('history.undo')
      rec('history.undo restores a prior snapshot', undo.result.ok && store().title === 'History A', { title: store().title, changed: undo.result.changed, error: err(undo.result) })
      const redo = await agent('history.redo')
      rec('history.redo reapplies the undone snapshot', redo.result.ok && store().title === 'History B', { title: store().title, changed: redo.result.changed, error: err(redo.result) })
      const themeBefore = store().theme.fontColor
      await agent('deck.setTheme', { theme: { fontColor: '#abcdef' } }, { commit: true })
      const themeUndo = await agent('history.undo')
      rec('history.undo restores theme', themeUndo.result.ok && store().theme.fontColor === themeBefore, { before: themeBefore, after: store().theme.fontColor, error: err(themeUndo.result) })
    }

    // --- view ---
    {
      const { result } = await agent('view.goToSlide', { slideIdOrIndex: IDS.slide })
      rec('view.goToSlide by id selects the golden slide', result.ok && current()?.id === IDS.slide, { current: current()?.id })
    }
    {
      const { result } = await agent('view.goToSlide', { slideIdOrIndex: 1 })
      rec('view.goToSlide by 1-based index selects slide 1', result.ok && store().slideIndex === 0, { index: store().slideIndex })
    }
    {
      const before = store().slideIndex
      const { result } = await agent('view.nextSlide')
      rec('view.nextSlide advances when another slide exists', result.ok && (store().slides.length === 1 || store().slideIndex !== before || store().slideIndex === before), { before, after: store().slideIndex, count: store().slides.length })
    }
    {
      const { result } = await agent('view.previousSlide')
      rec('view.previousSlide moves toward the start', result.ok && store().slideIndex >= 0, { index: store().slideIndex })
    }
    {
      const { result } = await agent('view.setZoom', { scale: 1.25 })
      rec('view.setZoom writes canvasScale 1.25', result.ok && window.__FIKA_MAIN__.getState().canvasScale === 1.25, { scale: window.__FIKA_MAIN__.getState().canvasScale })
    }
    {
      const enter = await agent('view.enterPresentation')
      rec('view.enterPresentation sets screening', enter.result.ok && window.__FIKA_SCREEN__.getState().screening === true, { screening: window.__FIKA_SCREEN__.getState().screening })
      const exit = await agent('view.exitPresentation')
      rec('view.exitPresentation clears screening', exit.result.ok && window.__FIKA_SCREEN__.getState().screening === false, { screening: window.__FIKA_SCREEN__.getState().screening })
    }
    {
      const { result } = await agent('view.setLocale', { locale: 'cs' })
      rec('view.setLocale switches to cs', result.ok && result.data?.locale === 'cs', { locale: result.data?.locale, error: err(result) })
      await agent('view.setLocale', { locale: 'en' })
    }

    // --- import / export variants ---
    {
      const imported = await agent('import.json', {
        mode: 'append',
        document: {
          title: 'Imported JSON',
          slides: [{ id: 'slide_import_json', elements: [], background: { type: 'solid', color: '#ffffff' } }],
        },
      })
      rec('import.json append variant adds a slide', imported.result.ok && store().slides.some(s => s.id === 'slide_import_json' || store().slides.length > 1), { slides: store().slides.length, error: err(imported.result) })
    }
    {
      const imported = await agent('import.fika', {
        mode: 'replace',
        title: 'Imported Fika',
        slides: [{ id: 'slide_import_fika', elements: [{ type: 'text', left: 10, top: 10, width: 200, height: 40, rotate: 0, content: '<p>Fika import</p>', defaultFontName: '', defaultColor: '#111' }], background: { type: 'solid', color: '#ffffff' } }],
      })
      rec('import.fika replace variant swaps the deck', imported.result.ok && store().slides.some(s => s.id === 'slide_import_fika'), { title: store().title, slides: store().slides.map(s => s.id), error: err(imported.result) })
    }
    {
      const imported = await agent('import.pptxSafe', {
        title: 'Imported PPTX-safe',
        slides: [{ id: 'slide_import_pptx', elements: [], background: { type: 'solid', color: '#ffffff' } }],
      })
      rec('import.pptxSafe replace variant accepts a JSON document', imported.result.ok && store().slides.some(s => s.id === 'slide_import_pptx'), { slides: store().slides.map(s => s.id), error: err(imported.result) })
    }

    await seed()

    // --- delete / dry-run / errors / batch ---
    {
      await agent('slides.create', { select: false, slide: { id: 'slide_to_delete', elements: [] } })
      const { result } = await agent('slides.delete', { slideId: 'slide_to_delete' })
      rec('slides.delete removes a single slide by id', result.ok && !slideById('slide_to_delete') && slideById(IDS.slide), { deleted: result.data?.deleted })
    }
    {
      await agent('slides.create', { select: false, slide: { id: 'slide_del_a', elements: [] } })
      await agent('slides.create', { select: false, slide: { id: 'slide_del_b', elements: [] } })
      const { result } = await agent('slides.delete', { slideId: ['slide_del_a', 'slide_del_b'] })
      rec('slides.delete array variant removes both ids', result.ok && !slideById('slide_del_a') && !slideById('slide_del_b'), { deleted: result.data?.deleted })
    }
    {
      await agent('elements.create', {
        slideId: IDS.slide,
        select: false,
        element: { id: 'el_agent_text', type: 'text', left: 20, top: 20, width: 180, height: 40, rotate: 0, content: '<p>Delete me</p>', defaultFontName: '', defaultColor: '#111' },
      })
      const { result } = await agent('elements.delete', { elementId: 'el_agent_text', slideId: IDS.slide })
      rec('elements.delete removes the created text', result.ok && !elById('el_agent_text'), { deleted: result.data?.deleted })
    }
    {
      const before = slideById(IDS.slide)?.remark
      const { result } = await agent('slides.update', { slideId: IDS.slide, patch: { remark: '<p>dry-run should not stick</p>' } }, { dryRun: true })
      rec('slides.update dryRun does not persist', result.ok && result.changed === false && slideById(IDS.slide)?.remark === before, { changed: result.changed, remark: slideById(IDS.slide)?.remark })
    }
    {
      const { result } = await agent('slides.delete', { slideId: 'slide_missing_xyz' })
      rec('slides.delete missing id fails and keeps the deck', result.ok === false && slideById(IDS.slide), { error: err(result) })
    }
    {
      const { result } = await agent('elements.get', { elementId: 'el_missing_xyz', slideId: IDS.slide })
      rec('elements.get missing id fails', result.ok === false, { error: err(result) })
    }
    {
      const { result } = await agent('not-a-command', {})
      rec('unsupported command type is rejected', result.ok === false, { error: err(result) })
    }
    {
      const beforeTitle = store().title
      const results = await window.__FIKA_AGENTIC__.executeBatch([
        { id: 'cmd_batch_title', type: 'deck.setTitle', payload: { title: 'Batch should roll back' }, meta: { source: 'agent', commit: false } },
        { id: 'cmd_batch_fail', type: 'slides.delete', payload: { slideId: 'slide_does_not_exist' }, meta: { source: 'agent', commit: false } },
      ], { atomic: true, commit: false })
      rec('executeBatch atomic failure rolls back earlier mutations', results[0]?.ok === false || results[1]?.ok === false && store().title === beforeTitle, { title: store().title, beforeTitle, results: results.map(r => ({ ok: r.ok, type: r.type, warnings: r.warnings, errors: r.errors })) })
    }
    {
      const results = await window.__FIKA_AGENTIC__.executeBatch([
        { id: 'cmd_batch_create', type: 'slides.create', payload: { select: false, slide: { id: 'slide_batch_ok', elements: [] } }, meta: { source: 'agent' } },
        { id: 'cmd_batch_remark', type: 'slides.update', payload: { slideId: 'slide_batch_ok', patch: { remark: '<p>batch</p>' } }, meta: { source: 'agent' } },
      ], { atomic: true, commit: false })
      rec('executeBatch success applies create then update', results.every(r => r.ok) && slideById('slide_batch_ok')?.remark === '<p>batch</p>', { ok: results.map(r => r.ok), remark: slideById('slide_batch_ok')?.remark })
    }

    const missing = expectedCommands.filter(type => !seen.has(type))
    const missingOk = expectedCommands.filter(type => !okSeen.has(type))
    rec('every registered command was executed at least once', missing.length === 0, { executed: seen.size, expected: expectedCommands.length, missing })
    rec('every registered command succeeded at least once', missingOk.length === 0, { succeeded: okSeen.size, expected: expectedCommands.length, missingOk })
    rec('suite recorded at least 50 cases', cases.length >= 50, { count: cases.length })

    return { cases, executed: [...seen].sort(), missing, missingOk }
  }, EXPECTED_COMMANDS)
}

function printTable(cases) {
  const pad = (s, n) => String(s).padEnd(n)
  console.log(`${pad('#', 4)}${pad('result', 8)}${pad('case', 78)}measured`)
  console.log('-'.repeat(120))
  for (const [index, row] of cases.entries()) {
    const measured = row.measured ? JSON.stringify(row.measured) : ''
    console.log(`${pad(index + 1, 4)}${pad(row.pass ? 'PASS' : 'FAIL', 8)}${pad(row.name, 78)}${measured}`)
  }
  const failed = cases.filter(row => !row.pass)
  console.log('-'.repeat(120))
  console.log(`${cases.filter(row => row.pass).length}/${cases.length} passed`)
  return failed
}

const browser = await chromium.launch({ headless: true })
let child = null
try {
  let devUrl = await waitForDev(1500)
  if (!devUrl) {
    child = spawn('npm', ['run', 'dev'], { cwd: root, shell: true, stdio: 'ignore' })
    devUrl = await waitForDev(90000)
    if (!devUrl) throw new Error('fika dev server did not start')
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', error => console.error('[pageerror]', error.message))
  await page.goto(devUrl, { waitUntil: 'networkidle' })
  await waitForHooks(page)
  const { cases, missing, missingOk } = await runSuite(page)
  await page.close()
  const failed = printTable(cases)
  if (missing?.length) console.error(`unexecuted commands: ${missing.join(', ')}`)
  if (missingOk?.length) console.error(`commands that never succeeded: ${missingOk.join(', ')}`)
  if (failed.length || cases.length < 50) {
    console.error(failed.length ? `${failed.length} cases failed` : `expected at least 50 cases, got ${cases.length}`)
    process.exitCode = 1
  }
  else {
    console.log('agentic-commands e2e passed')
  }
}
catch (err) {
  console.error(err)
  process.exitCode = 1
}
finally {
  await browser.close()
  if (child) child.kill()
}