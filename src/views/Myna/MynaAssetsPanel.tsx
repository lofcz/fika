import { useMemo, useState } from 'react'
import { Image as ImageIcon, Music, Search, Video, Plus } from 'lucide-react'
import { useMainStore, useSlidesStore } from '@/store'
import useCreateElement from '@/hooks/useCreateElement'
import type { Slide } from '@/types/slides'
import type { FikaMediaKind } from '@/configs/mediaUpload'
import { bindStyles } from '@/utils/cssm'
import styles from './mynaPanels.module.scss'

const cx = bindStyles(styles)
export interface MynaAssetLabels {
  hint: string; search: string; all: string; image: string; video: string; audio: string
  empty: string; noResults: string; insertFailed: string
  insert: (name: string) => string; uses: (count: number) => string
}
export interface MynaAsset { src: string; kind: FikaMediaKind; name: string; poster?: string; ext?: string; uses: number }

/** Reuse document media without uploading a second copy; source URLs remain durable. */
export function collectMynaAssets(slides: Slide[]): MynaAsset[] {
  const assets = new Map<string, MynaAsset>()
  const add = (asset: Omit<MynaAsset, 'uses'>) => {
    if (!asset.src) return
    const key = `${asset.kind}:${asset.src}`
    const existing = assets.get(key)
    if (existing) { existing.uses++; if (!existing.name && asset.name) existing.name = asset.name }
    else assets.set(key, { ...asset, uses: 1 })
  }
  for (const slide of slides) {
    if (slide.background?.type === 'image') add({ src: slide.background.image?.src ?? '', kind: 'image', name: '' })
    for (const element of slide.elements) {
      if (element.type === 'image') add({ src: element.src, kind: 'image', name: element.name ?? '' })
      else if (element.type === 'video' || element.type === 'audio') add({ src: element.src, kind: element.type, name: element.name ?? '', poster: element.poster, ext: element.ext })
      else if (element.type === 'shape' && element.pattern) add({ src: element.pattern, kind: 'image', name: element.name ?? '' })
    }
  }
  return [...assets.values()]
}

export default function MynaAssetsPanel({ labels }: { labels: MynaAssetLabels }) {
  const slides = useSlidesStore(s => s.slides)
  const readOnly = useMainStore(s => s.readOnly)
  const assets = useMemo(() => collectMynaAssets(slides), [slides])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<FikaMediaKind | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const { createMediaElements } = useCreateElement()
  const named = assets.map((asset, index) => ({ ...asset, displayName: asset.name || `${labels[asset.kind]} ${index + 1}` }))
  const filtered = named.filter(asset => (kind === 'all' || asset.kind === kind) && asset.displayName.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const insert = async (asset: MynaAsset) => {
    if (readOnly || busy) return
    setFailed(false); setBusy(asset.src)
    try { await createMediaElements([{ src: asset.src, kind: asset.kind, ext: asset.ext }]) }
    catch { setFailed(true) }
    finally { setBusy(null) }
  }
  return <div className={cx('panel')}>
    <p className={cx('hint')}>{labels.hint}</p>
    <label className={cx('search')}><Search size={16} /><input aria-label={labels.search} placeholder={labels.search} value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className={cx('filters')}>{(['all', 'image', 'video', 'audio'] as const).map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>{labels[value]}</button>)}</div>
    {!filtered.length && <p className={cx('empty')}>{assets.length ? labels.noResults : labels.empty}</p>}
    {failed && <p role="alert">{labels.insertFailed}</p>}
    <div className={cx('asset-grid')} aria-busy={busy !== null}>{filtered.map(asset => <button key={`${asset.kind}:${asset.src}`} type="button" className={cx('asset')} disabled={readOnly || busy !== null} aria-label={labels.insert(asset.displayName)} onClick={() => void insert(asset)}>
      <span className={cx('asset-preview')}>
        {asset.kind === 'image' || asset.poster ? <img loading="lazy" src={asset.kind === 'image' ? asset.src : asset.poster} alt="" /> : asset.kind === 'video' ? <Video size={30} /> : <Music size={30} />}
        <span className={cx('asset-add')}><Plus size={15} /></span>
      </span>
      <span className={cx('asset-name')}>{asset.displayName}</span>
      <span className={cx('asset-meta')}>{asset.kind === 'image' ? <ImageIcon size={12} /> : asset.kind === 'video' ? <Video size={12} /> : <Music size={12} />}{labels.uses(asset.uses)}</span>
    </button>)}</div>
  </div>
}
