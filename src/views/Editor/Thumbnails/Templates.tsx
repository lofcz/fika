import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './Templates.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, type CSSProperties } from 'react'

import { nanoid } from 'nanoid'
import { useSlidesStore } from '@/store'
import type { ImportedSlideTemplate, Slide, SlideThemeFile } from '@/types/slides'
import { decrypt } from '@/utils/crypto'
import { parseThemeFileContent } from '@/utils/themeFile'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'
import { loadConfiguredTemplate, normalizeTemplatePayload, type TemplatePayload } from '@/configs/templates'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import Button from '@/components/Button'
import FileInput from '@/components/FileInput'
import Tabs from '@/components/Tabs'
import LoadingOverlay from '@/components/LoadingOverlay'

interface CatalogItem {
  id: string
  name: string
  source: 'current' | 'preset' | 'imported'
}

type CatalogPayload = TemplatePayload | Slide[]
type CatalogId = string
type CatalogRequest = globalThis.Promise<CatalogPayload>

export type ITemplatesProps = {
  onSelect?: (payload: Slide) => void
  onSelectAll?: (payload: { slides: Slide[]; theme: SlideThemeFile['theme'] }) => void
  onExport?: (payload: SlideThemeFile) => void
  className?: string
  style?: CSSProperties
}

const CURRENT_THEME_ID = 'current_theme'

const Templates = memo((props: ITemplatesProps) => {
  const { LL } = useI18nContext()
  const importedTemplates = useSlidesStore(s => s.importedTemplates)
  const documentSlides = useSlidesStore(s => s.slides)
  const templates = useSlidesStore(s => s.templates)
  const documentTheme = useSlidesStore(s => s.theme)
  const viewportRatio = useSlidesStore(s => s.viewportRatio)
  const viewportSize = useSlidesStore(s => s.viewportSize)

  const [remoteThemeData, setRemoteThemeData] = useState<SlideThemeFile>({
    title: '',
    width: viewportSize,
    height: viewportSize * viewportRatio,
    theme: {},
    slides: [],
  })
  const listRef = useRef<HTMLDivElement>(null)
  const loadSequenceRef = useRef(0)
  const catalogCacheRef = useRef(new Map() as Map<CatalogId, CatalogRequest>)
  const activeCatalogRef = useRef('')

  const types = useMemo(() => {
    const slideTypes = LL.editor.templates.slideTypes
    return [
      { label: slideTypes.all(), key: 'all' },
      { label: slideTypes.cover(), key: 'cover' },
      { label: slideTypes.contents(), key: 'contents' },
      { label: slideTypes.transition(), key: 'transition' },
      { label: slideTypes.content(), key: 'content' },
      { label: slideTypes.end(), key: 'end' },
    ]
  }, [LL])

  const [activeType, setActiveType] = useState('all')
  const [activeCatalog, setActiveCatalog] = useState('')
  const [loading, setLoading] = useState(false)
  activeCatalogRef.current = activeCatalog

  const currentThemeSlides = useMemo(
    () => documentSlides.filter(slide => !!slide.type),
    [documentSlides],
  )

  const catalogs = useMemo<CatalogItem[]>(() => {
    const currentCatalog: CatalogItem[] = currentThemeSlides.length
      ? [{ id: CURRENT_THEME_ID, name: LL.editor.templates.currentTheme(), source: 'current' }]
      : []
    const hostCatalogs: CatalogItem[] = templates.map(item => ({
      id: item.id,
      name: item.name,
      source: 'preset',
    }))
    const localCatalogs: CatalogItem[] = importedTemplates.map(item => ({
      id: item.id,
      name: item.name,
      source: 'imported',
    }))
    return [...currentCatalog, ...hostCatalogs, ...localCatalogs]
  }, [currentThemeSlides.length, LL, templates, importedTemplates])

  const catalogsRef = useRef(catalogs)
  catalogsRef.current = catalogs

  const activeCatalogItem = catalogs.find(item => item.id === activeCatalog)

  const activeThemeData = useMemo<SlideThemeFile>(() => {
    if (activeCatalog === CURRENT_THEME_ID) {
      return {
        title: LL.editor.templates.currentTheme(),
        width: viewportSize,
        height: viewportSize * viewportRatio,
        theme: documentTheme,
        slides: currentThemeSlides,
      }
    }

    const importedTemplate = importedTemplates.find(item => item.id === activeCatalog)
    if (importedTemplate) {
      return {
        title: importedTemplate.name,
        width: importedTemplate.width,
        height: importedTemplate.height,
        theme: importedTemplate.theme,
        slides: importedTemplate.slides,
      }
    }

    return {
      ...remoteThemeData,
      title: activeCatalogItem?.name || remoteThemeData.title,
    }
  }, [
    activeCatalog,
    LL,
    viewportSize,
    viewportRatio,
    documentTheme,
    currentThemeSlides,
    importedTemplates,
    remoteThemeData,
    activeCatalogItem?.name,
  ])

  const activeSlides = activeThemeData.slides

  const cloneSlides = (slides: Slide[]) => JSON.parse(JSON.stringify(slides)) as Slide[]
  const prepareSlidesForInsert = (slides: Slide[]) => {
    const clonedSlides = cloneSlides(slides)
    for (const slide of clonedSlides) delete slide.type
    return clonedSlides
  }

  const insertTemplate = useCallback((slide: Slide) => {
    props.onSelect?.(prepareSlidesForInsert([slide])[0])
  }, [props.onSelect])

  const insertTemplates = useCallback(() => {
    props.onSelectAll?.({
      slides: prepareSlidesForInsert(activeSlides),
      theme: JSON.parse(JSON.stringify(activeThemeData.theme)),
    })
  }, [props.onSelectAll, activeSlides, activeThemeData.theme])

  const openExportDialog = useCallback(() => {
    const data = activeThemeData
    if (!data.slides.length) {
      message.warning(LL.editor.templates.noExportablePages())
      return
    }

    props.onExport?.({
      title: activeCatalogItem?.name || data.title || LL.editor.templates.currentTheme(),
      width: data.width,
      height: data.height,
      theme: JSON.parse(JSON.stringify(data.theme)),
      slides: cloneSlides(data.slides),
    })
  }, [activeThemeData, LL, props.onExport, activeCatalogItem?.name])

  const scrollListToTop = useCallback(() => {
    Promise.resolve().then(() => listRef.current?.scrollTo(0, 0))
  }, [])

  const applyCatalogData = useCallback((ret: CatalogPayload, catalogName: string) => {
    const data = normalizeTemplatePayload(ret, LL)
    setRemoteThemeData({
      title: catalogName || data.title || '',
      width: typeof data.width === 'number' ? data.width : viewportSize,
      height: typeof data.height === 'number' ? data.height : viewportSize * viewportRatio,
      theme: data.theme ?? {},
      slides: data.slides,
    })
  }, [LL, viewportSize, viewportRatio])

  const fetchCatalogData = async (id: string): CatalogRequest => {
    const configuredTemplate = await loadConfiguredTemplate(id)
    if (configuredTemplate) return configuredTemplate
    throw new Error(`Unknown template "${id}"`)
  }

  const loadCatalogData = (id: string) => {
    const cached = catalogCacheRef.current.get(id)
    if (cached) return cached

    const request = fetchCatalogData(id).catch(error => {
      catalogCacheRef.current.delete(id)
      throw error
    })
    catalogCacheRef.current.set(id, request)
    return request
  }

  const changeCatalog = useCallback((id: string) => {
    setActiveCatalog(id)
    activeCatalogRef.current = id
    setActiveType('all')
    const currentSequence = ++loadSequenceRef.current

    const catalog = catalogsRef.current.find(item => item.id === id)
    if (!catalog || catalog.source !== 'preset') {
      setLoading(false)
      scrollListToTop()
      return
    }

    setLoading(true)
    loadCatalogData(id)
      .then(ret => {
        if (currentSequence !== loadSequenceRef.current || activeCatalogRef.current !== id) return
        applyCatalogData(ret, catalog.name)
        setLoading(false)
        scrollListToTop()
      })
      .catch(() => {
        if (currentSequence !== loadSequenceRef.current) return
        setRemoteThemeData(prev => ({
          ...prev,
          slides: [],
        }))
        setLoading(false)
      })
  }, [scrollListToTop, applyCatalogData])

  const changeCatalogRef = useRef(changeCatalog)
  changeCatalogRef.current = changeCatalog

  const getImportedTheme = (file: File, fileContent: string): ImportedSlideTemplate => {
    const isFika = file.name.toLowerCase().endsWith('.fika')
    const data = parseThemeFileContent(fileContent, { encrypted: isFika, decrypt })

    return {
      id: `imported_theme_${nanoid(10)}`,
      name: data.title,
      width: data.width,
      height: data.height,
      theme: JSON.parse(JSON.stringify(data.theme)),
      slides: cloneSlides(data.slides),
    }
  }

  const mapThemeImportError = useCallback((error: unknown) => {
    const msg = error instanceof Error ? error.message : ''
    if (msg.includes('non-empty slides')) return LL.editor.templates.themeInvalid()
    if (msg.includes('slide at index') || msg.includes('elements array')) {
      return LL.editor.templates.themePageInvalid()
    }
    if (msg.includes('decrypt') || msg.includes('parse') || msg.includes('JSON object') || msg.includes('title') || msg.includes('theme object') || msg.includes('width') || msg.includes('height')) {
      return LL.editor.templates.themeParseFailed()
    }
    return LL.editor.templates.themeParseFailed()
  }, [LL])

  const importTheme = useCallback((files: FileList) => {
    const file = files[0]
    if (!file) return

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      try {
        const template = getImportedTheme(file, reader.result as string)
        useSlidesStore.getState().addImportedTemplate(template)
        changeCatalog(template.id)
        message.success(LL.editor.templates.themeImportSuccess({ name: template.name }))
      }
      catch (error) {
        message.error(mapThemeImportError(error))
      }
    })
    reader.addEventListener('error', () => message.error(LL.editor.templates.themeReadFailed()))
    reader.readAsText(file)
  }, [changeCatalog, LL, mapThemeImportError])

  useEffect(() => {
    if (!currentThemeSlides.length && activeCatalogRef.current === CURRENT_THEME_ID) {
      const fallbackCatalog = catalogsRef.current[0]
      if (fallbackCatalog) changeCatalogRef.current(fallbackCatalog.id)
    }
  }, [currentThemeSlides.length])

  useEffect(() => {
    const firstCatalog = catalogsRef.current[0]
    if (firstCatalog) changeCatalogRef.current(firstCatalog.id)
  }, [])

  return (
    <div className={cx('templates', props.className)} style={props.style}>
      <div className={cx('catalogs')}>
        <div className={cx('catalog-list')}>
          {catalogs.map(item => (
            <div
              className={cx('catalog', { active: activeCatalog === item.id })}
              key={item.id}
              onClick={() => changeCatalog(item.id)}
            >
              {item.name}
            </div>
          ))}
        </div>
        <FileInput className={cx('import-theme')} accept=".json,.fika" onChange={importTheme}>
          <Icon icon="upload" /> {LL.editor.templates.importTheme()}
        </FileInput>
      </div>
      <LoadingOverlay className={cx('content')} state={loading} text={LL.common.loading()}>
        <div className={cx('header')}>
          <Tabs
            className={cx('types')}
            tabs={types}
            value={activeType}
            onUpdateValue={value => setActiveType(value)}
          />
          <div className={cx('header-actions')}>
            <div className={cx('header-action')} onClick={() => insertTemplates()}>
              {LL.editor.templates.insertAll()}
            </div>
            <div className={cx('header-action')} onClick={() => openExportDialog()}>
              {LL.editor.templates.exportTheme()}
            </div>
          </div>
        </div>
        <div className={cx('list')} ref={listRef}>
          {activeSlides.map(slide => (
            slide.type === activeType || activeType === 'all' ? (
              <div className={cx('slide-item')} key={slide.id}>
                <ThumbnailSlide className={cx('thumbnail')} slide={slide} size={180} />
                <div className={cx('btns')}>
                  <Button className={cx('btn')} type="primary" size="small" onClick={() => insertTemplate(slide)}>
                    {LL.editor.templates.insertTemplate()}
                  </Button>
                </div>
              </div>
            ) : null
          ))}
        </div>
      </LoadingOverlay>
    </div>
  )
})

export default Templates
