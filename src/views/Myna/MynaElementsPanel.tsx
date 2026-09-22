import { useId, useState } from 'react'
import { Search, QrCode, ArrowLeft, ChevronRight, PencilLine, MousePointerClick, Spline, ChartColumn, ChartBar, ChartLine, ChartArea, ChartScatter, ChartPie, CircleDot, Radar } from 'lucide-react'
import { SHAPE_LIST, type ShapePoolItem } from '@/configs/shapes'
import { LINE_LIST, type LinePoolItem } from '@/configs/lines'
import type { ChartType } from '@/types/slides'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore } from '@/store'
import { FRAME_LAYOUTS } from './photoFrames'
import { photoFrameLabels } from './photoFrameLabels'
import MynaFramesPanel from './MynaFramesPanel'
import MynaQrPanel from './MynaQrPanel'
import { qrMessages } from './qrMessages'
import TableGenerator from '@/views/Editor/CanvasTool/TableGenerator'
import LinePointMarker from '@/views/components/element/LineElement/LinePointMarker'
import { bindStyles } from '@/utils/cssm'
import styles from './mynaElements.module.scss'
const cx = bindStyles(styles)

export default function MynaElementsPanel({ onShape, onLine, onChart, onTable, onScribble, onPolygon, onPath }: {
  onShape: (shape: ShapePoolItem) => void; onLine: (line: LinePoolItem) => void
  onChart: (chart: ChartType) => void; onTable: (row: number, col: number) => void
  onScribble: () => void; onPolygon: () => void; onPath: () => void
}) {
  const { LL, locale } = useI18nContext()
  const labels = ({ en: { frames: "Frames", grids: "Photo grids", tools: "Tools", back: "All elements", qr: "Turn a link or text into a scannable code" }, cs: { frames: "Rámečky", grids: "Fotografické mřížky", tools: "Nástroje", back: "Všechny prvky", qr: "Proměňte odkaz nebo text v čitelný kód" }, sk: { frames: "Rámčeky", grids: "Fotografické mriežky", tools: "Nástroje", back: "Všetky prvky", qr: "Premeňte odkaz alebo text na čitateľný kód" }, pl: { frames: "Ramki", grids: "Siatki zdjęć", tools: "Narzędzia", back: "Wszystkie elementy", qr: "Zamień link lub tekst w kod do zeskanowania" } } as const)[locale as "en" | "cs" | "sk" | "pl"]
  const qr = qrMessages(locale)
  const [qrOpen, setQrOpen] = useState(false)
  const tool = LL.editor.canvasTool
  const readOnly = useMainStore(s => s.readOnly)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const markerId = useId().replace(/:/g, '')
  const groups = SHAPE_LIST.map(group => ({ ...group, label: tool.shapeTabs[group.categoryKey]() }))
  const drawing = [
    { id: 'scribble', label: tool.scribble(), description: tool.scribbleDesc(), icon: PencilLine, run: onScribble },
    { id: 'polygon', label: tool.drawShape(), description: tool.drawShapeDesc(), icon: MousePointerClick, run: onPolygon },
    { id: 'path', label: tool.pathDraw(), description: tool.pathDrawDesc(), icon: Spline, run: onPath },
  ]
  const charts = [
    { type: 'bar', icon: ChartColumn }, { type: 'column', icon: ChartBar }, { type: 'line', icon: ChartLine }, { type: 'area', icon: ChartArea },
    { type: 'scatter', icon: ChartScatter }, { type: 'pie', icon: ChartPie }, { type: 'ring', icon: CircleDot }, { type: 'radar', icon: Radar },
  ] as const
  const filters = [{ id: 'all', label: LL.myna.all() }, { id: 'frames', label: labels.frames }, { id: 'grids', label: labels.grids }, { id: 'tools', label: labels.tools }, { id: 'shapes', label: LL.editor.elementTypes.shape() }, { id: 'lines', label: tool.linesAndArrows() }, { id: 'drawing', label: tool.draw() }, { id: 'charts', label: LL.myna.charts() }, { id: 'table', label: LL.editor.elementTypes.table() }]
  const matches = (label: string) => label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const visible = (id: string) => category === 'all' || category === id
  let count = 0
  const drawItems = drawing.filter(item => visible('drawing') && matches(`${tool.draw()} ${item.label} ${item.description}`))
  count += drawItems.length
  const shapeGroups = groups.map(group => ({ ...group, children: visible('shapes') && matches(`${LL.editor.elementTypes.shape()} ${group.label}`) ? group.children : [] })).filter(group => group.children.length)
  count += shapeGroups.reduce((total, group) => total + group.children.length, 0)
  const lineGroups = LINE_LIST.map(group => ({ ...group, label: LL.configs.lines[group.type]() })).filter(group => visible('lines') && matches(`${tool.linesAndArrows()} ${group.label}`))
  count += lineGroups.reduce((total, group) => total + group.children.length, 0)
  const chartItems = charts.filter(chart => visible('charts') && matches(`${LL.myna.charts()} ${LL.configs.chart.types[chart.type]()}`))
  count += chartItems.length
  const showTable = visible('table') && matches(LL.myna.table())
  if (showTable) count++
  const showQr = visible('tools') && matches(`${qr.title} ${labels.qr}`)
  const frameLabels = photoFrameLabels[locale] || photoFrameLabels.en
  const frameQuery = matches(labels.frames) ? '' : query
  const gridQuery = matches(labels.grids) ? '' : query
  const showFrames = visible('frames') && FRAME_LAYOUTS.some(layout => ['rect', 'roundRect', 'ellipse'].includes(layout) && frameLabels[layout].toLocaleLowerCase().includes(frameQuery.trim().toLocaleLowerCase()))
  const showGrids = visible('grids') && FRAME_LAYOUTS.some(layout => !['rect', 'roundRect', 'ellipse'].includes(layout) && frameLabels[layout].toLocaleLowerCase().includes(gridQuery.trim().toLocaleLowerCase()))
  if (showQr || showFrames || showGrids) count++
  if (qrOpen) return <div className={cx('elements')} data-myna-elements><button type="button" className={cx('back')} onClick={() => setQrOpen(false)}><ArrowLeft size={16}/>{labels.back}</button><h3 className={cx('heading')}>{qr.title}</h3><MynaQrPanel /></div>
  return <div className={cx('elements')} data-myna-elements>
    <label className={cx('search')}><Search size={16} /><input type="search" aria-label={LL.common.search()} placeholder={LL.common.search()} value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className={cx('filters')}>{filters.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
    {showQr && <section className={cx('collection')}><h3>{labels.tools}</h3><button type="button" className={cx('qr-tile')} aria-label={qr.title} onClick={() => setQrOpen(true)}><span className={cx('qr-icon')}><QrCode size={26}/></span><span><strong>{qr.title}</strong><small>{labels.qr}</small></span><ChevronRight size={16}/></button></section>}
    {showFrames && <section className={cx('collection')}><h3>{labels.frames}</h3><MynaFramesPanel query={frameQuery} kind="frames" compact /></section>}
    {showGrids && <section className={cx('collection')}><h3>{labels.grids}</h3><MynaFramesPanel query={gridQuery} kind="grids" compact /></section>}
    {!count && <p className={cx('empty')}>{LL.editor.search.noMatchesFound()}</p>}
    {!!drawItems.length && <section className={cx('section')}><h3>{tool.draw()}</h3><div className={cx('drawing')}>{drawItems.map(({ id, label, description, icon: Icon, run }) => <button type="button" key={id} disabled={readOnly} data-myna-drawing={id} onClick={run}><Icon size={21} /><span><strong>{label}</strong><small>{description}</small></span></button>)}</div></section>}
    {shapeGroups.map(group => <section className={cx('section')} key={group.categoryKey}><h3>{group.label}<span>{group.children.length}</span></h3><div className={cx('shape-grid')}>{group.children.map((shape, index) => <button type="button" key={index} data-shape-item="" data-shape-formula={shape.pathFormula || 'static'} disabled={readOnly} aria-label={`${group.label} ${index + 1}`} title={`${group.label} ${index + 1}`} onClick={() => onShape(shape)}>
      <svg width="30" height="30" viewBox={`0 0 ${shape.viewBox[0]} ${shape.viewBox[1]}`} aria-hidden="true"><path d={shape.path} fill={shape.outlined ? 'currentColor' : 'none'} stroke={shape.outlined ? 'none' : 'currentColor'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>
    </button>)}</div></section>)}
    {lineGroups.map((group, i) => <section className={cx('section')} key={group.type}><h3>{group.label}</h3><div className={cx('shape-grid')}>{group.children.map((line, index) => {
      const id = `${markerId}-${i}-${index}`
      return <button type="button" key={index} data-line-item="" disabled={readOnly} aria-label={`${group.label} ${index + 1}`} title={`${group.label} ${index + 1}`} onClick={() => onLine(line)}><svg width="30" height="30" viewBox="-5 -5 30 30" aria-hidden="true"><defs>{line.points[0] && <LinePointMarker id={id} position="start" type={line.points[0]} color="currentColor" baseSize={2} preview />}{line.points[1] && <LinePointMarker id={id} position="end" type={line.points[1]} color="currentColor" baseSize={2} preview />}</defs><path d={line.path} stroke="currentColor" fill="none" strokeWidth="1.5" strokeDasharray={line.style === 'solid' ? undefined : '4 2'} markerStart={line.points[0] ? `url(#${id}-${line.points[0]}-start)` : undefined} markerEnd={line.points[1] ? `url(#${id}-${line.points[1]}-end)` : undefined} /></svg></button>
    })}</div></section>)}
    {!!chartItems.length && <section className={cx('section')}><h3>{LL.myna.charts()}</h3><div className={cx('chart-grid')}>{chartItems.map(({ type, icon: Icon }) => <button type="button" key={type} disabled={readOnly} data-chart-type={type} onClick={() => onChart(type)}><Icon size={25} /><span>{LL.configs.chart.types[type]()}</span></button>)}</div></section>}
    {showTable && <section className={cx('section')}><h3>{LL.editor.elementTypes.table()}</h3><fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><TableGenerator onInsert={({ row, col }) => onTable(row, col)} /></fieldset></section>}
  </div>
}
