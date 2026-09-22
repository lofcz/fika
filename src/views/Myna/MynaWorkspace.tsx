import { recordRender } from '@/utils/renderMetrics'
import { selectInsertedElements } from '@/utils/selectInsertedElements'
import { WorkspaceLabelsPanel } from './WorkspaceLabels'
import MynaPageLayoutControls from './MynaPageLayoutControls'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useEffect, useMemo, useState } from 'react'
import { nanoid } from 'nanoid'
import { LayoutTemplate, Shapes, Type, Upload, Palette, Layers, Plus, Copy, Trash2, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Search, Maximize, Images, GalleryVerticalEnd } from 'lucide-react'
import { useMainStore, useSlidesStore } from '@/store'
import Canvas from '@/views/Editor/Canvas'
import CanvasTool from '@/views/Editor/CanvasTool'
import MynaInspector from './MynaInspector'
import Modal from '@/components/Modal'
import SVGPathEditor from '@/views/Editor/CanvasTool/SVGPathEditor'
import MynaElementsPanel from './MynaElementsPanel'
import MynaTemplateLibrary from './MynaTemplateLibrary'
import MediaPicker from '@/views/Editor/CanvasTool/MediaPicker'
import SlideDesignPanel from '@/views/Editor/Toolbar/SlideDesignPanel'
import ThumbnailSlide from '@/views/components/ThumbnailSlide'
import useCreateElement from '@/hooks/useCreateElement'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useSlideHandler from '@/hooks/useSlideHandler'
import useResizeDeck from '@/hooks/useResizeDeck'
import { resetCanvas } from '@/hooks/useScaleCanvas'
import { selectWorkspacePageNames } from './workspaceSelectors'
import { drainCommitQueue } from '@/utils/commitQueue'
import { getMynaFormats, getMynaTemplates, createMynaPage, createMynaTextPair, validMynaSize } from './catalog'
import MynaDownload from './MynaDownload'
import MynaDrawer from './MynaDrawer'
import MynaHeader from './MynaHeader'
import MynaZoomControl from './MynaZoomControl'
import MynaViewSettings from './MynaViewSettings'
import { useMynaViewStore } from './viewStore'
import MynaAssetsPanel from './MynaAssetsPanel'
import MynaPagesPanel from './MynaPagesPanel'
import MynaLayersPanel from './MynaLayersPanel'
import { bindStyles } from '@/utils/cssm'
import styles from './myna.module.scss'
const cx = bindStyles(styles)
type PanelId = 'templates' | 'elements' | 'text' | 'uploads' | 'styles' | 'layers' | 'assets' | 'pages'

export default function MynaWorkspace() {
  recordRender('MynaWorkspace')
  const { LL, locale } = useI18nContext()
  const t = LL.myna
  const mynaView = useMynaViewStore()
  const PANELS = [
  { id: 'templates', label: t.design(), icon: LayoutTemplate },
  { id: 'elements', label: t.elements(), icon: Shapes },
  { id: 'text', label: t.text(), icon: Type },
  { id: 'uploads', label: t.uploads(), icon: Upload },
  { id: 'assets', label: t.assets(), icon: Images },
  { id: 'pages', label: t.pages(), icon: GalleryVerticalEnd },
  { id: 'styles', label: t.styles(), icon: Palette },
  { id: 'layers', label: t.layers(), icon: Layers },
] as const
  const [panel, setPanel] = useState<PanelId | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [properties, setProperties] = useState(false)
  const [pathOpen, setPathOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [draggedPage, setDraggedPage] = useState<string | null>(null)
  const slides = useSlidesStore(selectWorkspacePageNames)
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const width = useSlidesStore(s => s.viewportSize)
  const ratio = useSlidesStore(s => s.viewportRatio)
  const readOnly = useMainStore(s => s.readOnly)
  const activeCount = useMainStore(s => s.activeElementIdList.length)
  const height = Math.round(width * ratio)
  const templates = useMemo(() => getMynaTemplates(t), [t, locale])
  const formats = getMynaFormats(t)
  const categories = { All: t.all(), Social: t.social(), Education: t.education(), Events: t.events(), Marketing: t.marketing() }
  const canUseTemplates = validMynaSize(Math.round(width), height)
  const previews = useMemo(() => canUseTemplates ? Object.fromEntries(templates.map(template => [template.id, createMynaPage(template.id, Math.round(width), height, t)])) : {}, [width, height, canUseTemplates, templates, t])
  const [customWidth, setCustomWidth] = useState(width)
  const [customHeight, setCustomHeight] = useState(height)
  const { createTextElement, createShapeElement, createLineElement, createChartElement, createTableElement } = useCreateElement()
  const { addHistorySnapshot } = useHistorySnapshot()
  const { createSlideByTemplate, copyAndPasteSlide, deleteSlide } = useSlideHandler()
  const resize = useResizeDeck()
  useEffect(() => { setCustomWidth(width); setCustomHeight(height) }, [width, height])
  useEffect(() => { if (activeCount) setProperties(true) }, [activeCount])
  const size = Math.min(width, height)
  const center = { left: (width - size * .3) / 2, top: (height - size * .3) / 2, width: size * .3, height: size * .3 }
  const goTo = (index: number) => {
    drainCommitQueue()
    useMainStore.getState().setActiveElementIdList([])
    useMainStore.getState().updateSelectedSlidesIndex([])
    useSlidesStore.getState().updateSlideIndex(index)
  }
  const reorder = (from: number, to: number) => {
    if (readOnly || from < 0 || to < 0 || to >= slides.length || from === to) return
    drainCommitQueue()
    useMainStore.getState().setActiveElementIdList([])
    useSlidesStore.getState().reorderSlides(from, to)
    addHistorySnapshot()
  }
  const changeSize = (w: number, h: number) => {
    if (readOnly || !validMynaSize(w, h)) return
    drainCommitQueue(); resize(w, h); resetCanvas(); setResizeOpen(false)
  }
  const addText = (text: string, fontSize: number, bold = false) => {
    if (readOnly) return
    const scaled = Math.round(size * fontSize)
    createTextElement({ left: width * .15, top: height * .4, width: width * .7, height: scaled * 1.4 }, { content: `<p style="font-size:${scaled}px;${bold ? 'font-weight:700;' : ''}">${text}</p>` })
  }
  const filtered = templates.filter(item => (category === 'All' || item.category === category) && `${item.name} ${item.categoryName}`.toLowerCase().includes(query.toLowerCase()))
  return <div className={cx('myna-workspace')} data-myna-workspace>
    <MynaHeader>
      <button disabled={readOnly} onClick={() => setResizeOpen(!resizeOpen)} aria-expanded={resizeOpen}><Maximize size={15} /> {t.resize()} <span className={cx('myna-dimensions')}>{width} × {height}</span></button>
      <span className={cx('myna-topbar-spacer')} />
      <MynaViewSettings />
      <button onClick={() => setProperties(!properties)} aria-pressed={properties} aria-controls="myna-properties"><SlidersHorizontal size={16} /> {t.properties()}</button>
      <button className={cx('myna-primary')} onClick={() => setDownloadOpen(true)}><Download size={16} /> {t.download()}</button>
    </MynaHeader>
    {resizeOpen && <section className={cx('myna-resize')} aria-label={t.resizeDesign()}>
      <strong>{t.resizeAll()}</strong><p>{t.resizeHint()}</p>
      <div className={cx('myna-formats')}>{formats.map(format => <button key={format.name} onClick={() => changeSize(format.width, format.height)}>{format.name}<small>{format.width} × {format.height}</small></button>)}</div>
      <form onSubmit={e => { e.preventDefault(); changeSize(customWidth, customHeight) }}>
        <label>{t.width()} <input type="number" min={100} max={8192} step={1} value={customWidth} onChange={e => setCustomWidth(Number(e.target.value))} /></label>
        <label>{t.height()} <input type="number" min={100} max={8192} step={1} value={customHeight} onChange={e => setCustomHeight(Number(e.target.value))} /></label>
        <button disabled={!validMynaSize(customWidth, customHeight)} className={cx('myna-primary')}>{t.apply()}</button><button type="button" onClick={() => setResizeOpen(false)}>{t.cancel()}</button>
      </form>
    </section>}
    <div className={cx('myna-body')}>
      <nav className={cx('myna-rail')} aria-label={t.tools()}>{PANELS.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={panel === id} aria-controls="myna-library" aria-expanded={panel === id} onClick={() => setPanel(panel === id ? null : id)}><Icon size={23} /><span>{label}</span></button>)}</nav>
      {panel && <MynaDrawer id="myna-library" title={t.library({ name: PANELS.find(item => item.id === panel)?.label ?? '' })} onClose={() => setPanel(null)}>
        <fieldset disabled={readOnly && !['pages', 'assets', 'layers'].includes(panel)} inert={readOnly && !['pages', 'assets', 'layers'].includes(panel)} className={cx('myna-panel-content')}>
          {panel === 'templates' && <>
            <MynaTemplateLibrary locale={locale} />
            <div className={cx('myna-search')}><Search size={17} /><input aria-label={t.search()} placeholder={t.search()} value={query} onChange={e => setQuery(e.target.value)} /></div>
            <div className={cx('myna-categories')}>{(Object.keys(categories) as Array<keyof typeof categories>).map(name => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{categories[name]}</button>)}</div>
            <p className={cx('myna-hint')}>{t.templateHint()}</p>
            <div className={cx('myna-template-grid')}>{filtered.map(template => <button key={template.id} className={cx('myna-template-card')} disabled={!canUseTemplates} onClick={() => createSlideByTemplate(createMynaPage(template.id, Math.round(width), height, t))}>
              <div className={cx('myna-template-preview')}>{previews[template.id] && <ThumbnailSlide slide={previews[template.id]} size={Math.min(104, 146 / ratio)} />}</div>
              <span>{template.name}</span><small>{template.categoryName}</small>
            </button>)}</div>
            {!filtered.length && <p>{t.noTemplates()}</p>}
            <button className={cx('myna-wide')} onClick={() => createSlideByTemplate({ id: nanoid(10), elements: [], background: { type: 'solid', color: '#ffffff' } })}><Plus size={16} /> {t.blank()}</button>
          </>}
          {panel === 'text' && <><p className={cx('myna-hint')}>{t.textHint()}</p><button className={cx('myna-text-heading')} onClick={() => addText(t.heading(), .065, true)}>{t.heading()}</button><button className={cx('myna-text-subheading')} onClick={() => addText(t.subheading(), .04, true)}>{t.subheading()}</button><button className={cx('myna-wide')} onClick={() => addText(t.paragraph(), .025)}>{t.bodyText()}</button><h3>{t.combinations()}</h3>{[t.bigIdeas(), t.once(), t.perspective()].map((text, index) => <button key={text} className={cx('myna-text-pair')} style={{ fontFamily: index === 1 ? 'Georgia, serif' : 'Arial, sans-serif' }} onClick={() => {
      if (readOnly) return
      drainCommitQueue()
      const elements = createMynaTextPair(text, index === 1 ? 'Georgia' : 'Arial', width, height, useSlidesStore.getState().theme.fontColor, t)
      useSlidesStore.getState().addElement(elements)
      selectInsertedElements(elements.map(element => element.id))
      addHistorySnapshot()
    }}>{text}<small>{t.storyStarts()}</small></button>)}</>}
          {panel === 'elements' && <MynaElementsPanel onPath={() => setPathOpen(true)} onShape={shape => createShapeElement(center, shape)} onLine={line => createLineElement({ left: center.left, top: center.top, start: [0, 0], end: [center.width, 0] }, line)} onScribble={() => { useMainStore.getState().setCreatingElement(null); useMainStore.getState().setCreatingCustomShapeState('scribble') }} onPolygon={() => { useMainStore.getState().setCreatingElement(null); useMainStore.getState().setCreatingCustomShapeState('polygon') }} onChart={createChartElement} onTable={createTableElement} />}
          {panel === 'uploads' && <MediaPicker />}
          {panel === 'assets' && <MynaAssetsPanel labels={{ hint: t.assetHint(), search: t.searchAssets(), all: t.allAssets(), image: t.assetImage(), video: t.assetVideo(), audio: t.assetAudio(), empty: t.noAssets(), noResults: t.noAssetResults(), insertFailed: t.assetInsertFailed(), insert: name => t.insertAsset({ name }), uses: count => t.assetUses({ count }) }} />}
          {panel === 'pages' && <><MynaPageLayoutControls /><WorkspaceLabelsPanel /><MynaPagesPanel labels={{ hint: t.pagesHint(), search: t.searchPages(), empty: t.noPages(), add: t.addPage(), duplicate: t.duplicate(), delete: t.delete(), moveUp: t.pageMoveUp(), moveDown: t.pageMoveDown(), page: number => t.page({ number }) }} /></>}
          {panel === 'styles' && <SlideDesignPanel />}
          {panel === 'layers' && <MynaLayersPanel />}
        </fieldset>
      </MynaDrawer>}
      <main className={cx('myna-stage')} aria-label={t.designCanvas()}>
        <div className={cx('myna-canvas-tools')} inert={readOnly}><CanvasTool /></div>
        <Canvas allowOverflow mynaView={mynaView} className={cx('myna-canvas')} />
        <div className={cx('myna-pages')} aria-label={t.pages()}>
          <div className={cx('myna-page-strip')}>{slides.map((slide, index) => <button key={slide.id} className={cx('myna-page', { selected: slideIndex === index })} aria-label={slide.canvasName || t.page({ number: index + 1 })} title={slide.canvasName || t.page({ number: index + 1 })} aria-current={slideIndex === index ? 'page' : undefined} draggable={!readOnly} onDragStart={e => { setDraggedPage(slide.id); e.dataTransfer.setData('text/x-myna-page', slide.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => setDraggedPage(null)} onDragOver={e => { if (draggedPage && !readOnly) e.preventDefault() }} onDrop={e => { e.preventDefault(); if (draggedPage && e.dataTransfer.getData('text/x-myna-page') === draggedPage) reorder(slides.findIndex(s => s.id === draggedPage), index); setDraggedPage(null) }} onClick={() => goTo(index)}><ThumbnailSlide slide={slide} size={Math.min(100, 68 / ratio)} /><span>{index + 1}</span></button>)}<button className={cx('myna-add-page')} disabled={readOnly} onClick={() => createSlideByTemplate({ id: nanoid(10), elements: [], background: { type: 'solid', color: '#ffffff' } })} aria-label={t.addPage()}><Plus size={24} /></button></div>
          <div className={cx('myna-page-actions')}>
            <button disabled={readOnly || slideIndex === 0} aria-label={t.moveLeft()} onClick={() => reorder(slideIndex, slideIndex - 1)}><ChevronLeft size={16} /></button>
            <button disabled={readOnly || slideIndex === slides.length - 1} aria-label={t.moveRight()} onClick={() => reorder(slideIndex, slideIndex + 1)}><ChevronRight size={16} /></button>
            <button disabled={readOnly} aria-label={t.duplicate()} onClick={() => { drainCommitQueue(); copyAndPasteSlide() }}><Copy size={16} /></button>
            <button disabled={readOnly || slides.length <= 1} aria-label={t.delete()} onClick={() => { drainCommitQueue(); deleteSlide([slides[slideIndex].id]) }}><Trash2 size={16} /></button>
          </div>
        </div>
        <footer className={cx('myna-statusbar')}><span>{t.pageCount({ current: slideIndex + 1, total: slides.length })}</span><span className={cx('myna-topbar-spacer')} /><MynaZoomControl /></footer>
      </main>
      {properties && <MynaDrawer id="myna-properties" side="right" title={t.designProperties()} onClose={() => setProperties(false)}><div className={cx('myna-property-content')} inert={readOnly}><MynaInspector /></div></MynaDrawer>}
    </div>
    <Modal visible={pathOpen && !readOnly} width={800} onUpdateVisible={setPathOpen}>
      {pathOpen && <SVGPathEditor onClose={() => setPathOpen(false)} onInsert={path => {
        if (readOnly) return
        const color = useSlidesStore.getState().theme.themeColors[0]
        createShapeElement(center, { path, viewBox: [400, 400] }, /z\s*$/i.test(path) ? { fill: color } : { fill: 'transparent', outline: { width: 2, color, style: 'solid' } })
        setPathOpen(false)
      }} />}
    </Modal>
    {downloadOpen && <MynaDownload onClose={() => setDownloadOpen(false)} />}
  </div>
}
