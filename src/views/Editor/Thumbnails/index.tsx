import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, type CSSProperties, type RefObject } from 'react'

import { useMainStore, useSlidesStore, useKeyboardStore } from '@/store'
import { beginPaneDrag, endPaneDrag } from './paneSize'
import type { SlideThemeFile } from '@/types/slides'
import { useRailItemSlide, useRailSlideMetas } from '@/views/components/ThumbnailSlide/paintedSlide'
import { fillDigit } from '@/utils/common'
import { queryFika } from '@/utils/portal'
import { openContextmenu } from '@/utils/openContextmenu'
import type { ContextmenuItem } from '@/components/Contextmenu/types'
import useSlideHandler from '@/hooks/useSlideHandler'
import useSectionHandler from '@/hooks/useSectionHandler'
import useScreening from '@/hooks/useScreening'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useThumbnailVirtualizer } from './useThumbnailVirtualizer'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import LayoutPicker from './LayoutPicker'
import ExportThemeDialog from './ExportThemeDialog'
import Popover from '@/components/Popover'
import Modal from '@/components/Modal'
import Draggable, { slideDragOverlay } from '@/components/Draggable'
import { useI18nContext } from '@/i18n/useI18nContext'
import {
  buildSlideGapAnchor,
  emitFikaAiSlideInsertCancel,
  emitFikaAiSlideInsertRequest,
  isFikaAiSlideInsertEnabled,
  useAiSlideInsert,
  type FikaAiSlideInsertLabels,
  type FikaSlideGapPosition,
} from '@/configs/aiSlideInsert'

type RailHandlers = {
  handleClickSlideThumbnail: (e: React.MouseEvent, index: number) => void
  enterScreening: () => void
  contextmenusThumbnailItem: () => ContextmenuItem[]
  contextmenusSection: (el: HTMLElement) => ContextmenuItem[] | null
  editSection: (id: string) => void
  saveSection: (e: React.FocusEvent | React.KeyboardEvent) => void
  openNotesPanel: () => void
  requestAiInsertAtGap: (spliceIndex: number) => void
  insertBlankSlideAtGap: (spliceIndex: number) => void
  cancelAiSlide: (requestId: string, slideId: string) => void
}

type GapLabels = {
  addWithAi: string
  addWithAiBeforeFirst: string
  addWithAiBetween: (after: number, before: number) => string
  addWithAiAfterLast: string
  addBlankSlide: string
  cancel: string
}

function formatBetweenLabel(template: string, after: number, before: number): string {
  return template.replace(/\{after\}/g, String(after)).replace(/\{before\}/g, String(before))
}

function stopGapPointer(e: React.PointerEvent | React.MouseEvent) {
  e.stopPropagation()
}

const SlideGapBar = memo(function SlideGapBar({
  position,
  spliceIndex,
  afterSlideId,
  beforeSlideId,
  aiDisabled,
  standalone = false,
  labels,
  onRequestAi,
  onInsertBlank,
}: {
  position: FikaSlideGapPosition
  spliceIndex: number
  afterSlideId: string | null
  beforeSlideId: string | null
  aiDisabled: boolean
  standalone?: boolean
  labels: GapLabels
  onRequestAi: (spliceIndex: number) => void
  onInsertBlank: (spliceIndex: number) => void
}) {
  const aiAriaLabel = position === 'before-first'
    ? labels.addWithAiBeforeFirst
    : position === 'after-last'
      ? labels.addWithAiAfterLast
      : labels.addWithAiBetween(spliceIndex, spliceIndex + 1)

  return (
    <div
      className={cx('gap-bar', `gap-${position}`, { 'gap-standalone': standalone })}
      data-fika-slide-gap={position}
      data-after-slide-id={afterSlideId ?? ''}
      data-before-slide-id={beforeSlideId ?? ''}
      onPointerDown={stopGapPointer}
      onMouseDown={stopGapPointer}
    >
      <div className={cx('gap-actions')}>
        <button
          type="button"
          className={cx('gap-btn', 'gap-ai-btn')}
          data-fika-gap-action="ai"
          data-fika-slide-gap={position}
          data-after-slide-id={afterSlideId ?? ''}
          data-before-slide-id={beforeSlideId ?? ''}
          aria-label={aiAriaLabel}
          title={aiAriaLabel}
          disabled={aiDisabled}
          onPointerDown={stopGapPointer}
          onMouseDown={stopGapPointer}
          onClick={event => {
            event.stopPropagation()
            onRequestAi(spliceIndex)
          }}
        >
          <Icon icon="sparkles" className={cx('gap-icon')} />
          <span className={cx('gap-btn-label')}>{labels.addWithAi}</span>
        </button>
        <button
          type="button"
          className={cx('gap-btn', 'gap-blank-btn')}
          data-fika-gap-action="blank"
          data-fika-slide-gap={position}
          data-after-slide-id={afterSlideId ?? ''}
          data-before-slide-id={beforeSlideId ?? ''}
          aria-label={labels.addBlankSlide}
          title={labels.addBlankSlide}
          onPointerDown={stopGapPointer}
          onMouseDown={stopGapPointer}
          onClick={event => {
            event.stopPropagation()
            onInsertBlank(spliceIndex)
          }}
        >
          <Icon icon="plus" className={cx('gap-icon')} />
        </button>
      </div>
    </div>
  )
})

SlideGapBar.displayName = 'SlideGapBar'

type ThumbnailRailItemProps = {
  slideId: string
  nextSlideId: string | null
  index: number
  totalSlides: number
  isActive: boolean
  isSelected: boolean
  hasSection: boolean
  editingSectionId: string
  handlersRef: RefObject<RailHandlers>
  sectionNamePlaceholder: string
  untitledSection: string
  defaultSection: string
  thumbSize: number
  showGapControls: boolean
  aiDisabled: boolean
  readOnly: boolean
  gapLabels: GapLabels
}

function areThumbnailRailItemPropsEqual(prev: ThumbnailRailItemProps, next: ThumbnailRailItemProps) {
  return prev.slideId === next.slideId
    && prev.nextSlideId === next.nextSlideId
    && prev.index === next.index
    && prev.totalSlides === next.totalSlides
    && prev.isActive === next.isActive
    && prev.isSelected === next.isSelected
    && prev.hasSection === next.hasSection
    && prev.editingSectionId === next.editingSectionId
    && prev.sectionNamePlaceholder === next.sectionNamePlaceholder
    && prev.untitledSection === next.untitledSection
    && prev.defaultSection === next.defaultSection
    && prev.handlersRef === next.handlersRef
    && prev.thumbSize === next.thumbSize
    && prev.showGapControls === next.showGapControls
    && prev.aiDisabled === next.aiDisabled
    && prev.readOnly === next.readOnly
    && prev.gapLabels === next.gapLabels
}

const ThumbnailRailItem = memo(function ThumbnailRailItem({
  slideId,
  nextSlideId,
  index,
  totalSlides,
  isActive,
  isSelected,
  hasSection,
  editingSectionId,
  handlersRef,
  sectionNamePlaceholder,
  untitledSection,
  defaultSection,
  thumbSize,
  showGapControls,
  aiDisabled,
  readOnly,
  gapLabels,
}: ThumbnailRailItemProps) {
  const slide = useRailItemSlide(slideId)

  const showSection = !!(slide?.sectionTag || (hasSection && index === 0))
  const sectionId = slide?.sectionTag?.id || ''
  const editingThisSection = editingSectionId === slide?.sectionTag?.id || (index === 0 && editingSectionId === 'default')
  const isLast = index === totalSlides - 1
  const requestAi = useCallback((spliceIndex: number) => handlersRef.current.requestAiInsertAtGap(spliceIndex), [handlersRef])
  const insertBlank = useCallback((spliceIndex: number) => handlersRef.current.insertBlankSlideAtGap(spliceIndex), [handlersRef])

  return (
    <div className={cx('thumbnail-container')}>
      {showGapControls && index === 0 ? (
        <SlideGapBar
          position="before-first"
          spliceIndex={0}
          afterSlideId={null}
          beforeSlideId={slideId}
          aiDisabled={aiDisabled}
          labels={gapLabels}
          onRequestAi={requestAi}
          onInsertBlank={insertBlank}
        />
      ) : null}
      {showSection ? (
        <div
          className={cx('section-title')}
          data-section-id={sectionId}
          onDoubleClick={() => handlersRef.current.editSection(sectionId)}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openContextmenu(event, handlersRef.current.contextmenusSection) }}
        >
          {editingThisSection ? (
            <input
              id={`section-title-input-${sectionId || 'default'}`}
              type="text"
              defaultValue={slide.sectionTag?.title || ''}
              placeholder={sectionNamePlaceholder}
              onBlur={event => handlersRef.current.saveSection(event)}
              onKeyDown={event => { if (event.key === 'Enter') { event.stopPropagation(); handlersRef.current.saveSection(event) } }}
            />
          ) : (
            <span className={cx('text')}>
              <div className={cx('text-content')}>
                {slide?.sectionTag
                  ? (slide.sectionTag.title || untitledSection)
                  : defaultSection}
              </div>
            </span>
          )}
        </div>
      ) : null}
      <div
        className={cx('thumbnail-item', {
          active: isActive,
          selected: isSelected,
        })}
        data-thumb-active={isActive ? '' : undefined}
        onMouseDown={event => handlersRef.current.handleClickSlideThumbnail(event, index)}
        onDoubleClick={() => handlersRef.current.enterScreening()}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openContextmenu(event, handlersRef.current.contextmenusThumbnailItem) }}
      >
        <div className={cx('label', { 'offset-left': index >= 99 })}>{fillDigit(index + 1, 2)}</div>
        <ThumbnailSlide className={cx('thumbnail')} slide={slide ?? { id: slideId }} size={thumbSize} />
        {slide?.notes && slide.notes.length ? (
          <div className={cx('note-flag')} onClick={() => handlersRef.current.openNotesPanel()}>{slide.notes.length}</div>
        ) : null}
        {!readOnly && slide?.skeleton && slide.aiRequestId ? (
          <button
            type="button"
            className={cx('cancel-ai-btn')}
            data-fika-ai-insert-cancel={slide.aiRequestId}
            aria-label={gapLabels.cancel}
            title={gapLabels.cancel}
            onPointerDown={stopGapPointer}
            onMouseDown={stopGapPointer}
            onClick={event => {
              event.stopPropagation()
              handlersRef.current.cancelAiSlide(slide.aiRequestId!, slideId)
            }}
          >
            <Icon icon="x" />
          </button>
        ) : null}
      </div>
      {showGapControls ? (
        <SlideGapBar
          position={isLast ? 'after-last' : 'between'}
          spliceIndex={index + 1}
          afterSlideId={slideId}
          beforeSlideId={isLast ? null : nextSlideId}
          aiDisabled={aiDisabled}
          labels={gapLabels}
          onRequestAi={requestAi}
          onInsertBlank={insertBlank}
        />
      ) : null}
    </div>
  )
}, areThumbnailRailItemPropsEqual)

ThumbnailRailItem.displayName = 'ThumbnailRailItem'

function resolveGapLabels(hostLabels: FikaAiSlideInsertLabels | undefined, LL: ReturnType<typeof useI18nContext>['LL']): GapLabels {
  const t = LL.editor.thumbnails
  return {
    addWithAi: hostLabels?.addWithAi || t.addWithAi(),
    addWithAiBeforeFirst: hostLabels?.addWithAiBeforeFirst || t.addWithAiBeforeFirst(),
    addWithAiBetween: (after, before) => hostLabels?.addWithAiBetween
      ? formatBetweenLabel(hostLabels.addWithAiBetween, after, before)
      : t.addWithAiBetween({ after, before }),
    addWithAiAfterLast: hostLabels?.addWithAiAfterLast || t.addWithAiAfterLast(),
    addBlankSlide: hostLabels?.addBlankSlide || t.addBlankSlideHere(),
    cancel: hostLabels?.cancel || t.cancelAiSlide(),
  }
}

const Thumbnails = memo(({ className, style }: { className?: string; style?: CSSProperties }) => {
  const { LL } = useI18nContext()
  const slides = useRailSlideMetas()
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const currentSlideHasSection = useSlidesStore(s => !!s.slides[s.slideIndex]?.sectionTag)
  const _selectedSlidesIndex = useMainStore(s => s.selectedSlidesIndex)
  const readOnly = useMainStore(s => s.readOnly)
  const aiSlideInsertConfig = useAiSlideInsert(s => s.config)
  const showGapControls = !readOnly && isFikaAiSlideInsertEnabled(aiSlideInsertConfig)
  const aiDisabled = !!aiSlideInsertConfig?.disabled
  const gapLabels = useMemo(() => resolveGapLabels(aiSlideInsertConfig?.labels, LL), [aiSlideInsertConfig?.labels, LL])
  const sectionLabels = useMemo(() => ({
    sectionNamePlaceholder: LL.editor.thumbnails.sectionNamePlaceholder(),
    untitledSection: LL.editor.thumbnails.untitledSection(),
    defaultSection: LL.editor.thumbnails.defaultSection(),
  }), [LL])
  const selectedSlidesSet = useMemo(() => {
    const set = new Set<number>(_selectedSlidesIndex)
    set.add(slideIndex)
    return set
  }, [_selectedSlidesIndex, slideIndex])
  const hasSection = useMemo(() => slides.some(item => item.sectionTag), [slides])
  const { scrollRef, virtualizer, virtualItems, dest } = useThumbnailVirtualizer(slides, hasSection, showGapControls)

  // Pane resize repaints canvases at their final backing-store dimensions.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.('.layout-separator')) beginPaneDrag()
    }
    const onPointerUp = () => endPaneDrag()
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('pointerup', onPointerUp, true)
    window.addEventListener('pointercancel', onPointerUp, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('pointerup', onPointerUp, true)
      window.removeEventListener('pointercancel', onPointerUp, true)
    }
  }, [])

  const [presetLayoutPopoverVisible, setPresetLayoutPopoverVisible] = useState(false)
  const [themeExportDialogVisible, setThemeExportDialogVisible] = useState(false)
  const [themeForExport, setThemeForExport] = useState<SlideThemeFile | null>(null)
  const [editingSectionId, setEditingSectionId] = useState('')
  const thumbnailsRootRef = useRef<HTMLDivElement>(null)
  const railHandlersRef = useRef<RailHandlers>({} as RailHandlers)

  const closeThemeExportDialog = useCallback(() => {
    setThemeExportDialogVisible(false)
    setThemeForExport(null)
  }, [])

  const {
    copySlide,
    pasteSlide,
    createSlide,
    createSlideByTemplate,
    copyAndPasteSlide,
    deleteSlide,
    cutSlide,
    selectAllSlide,
    sortSlides,
  } = useSlideHandler()

  const {
    createSection,
    removeSection,
    removeAllSection,
    removeSectionSlides,
    updateSectionTitle,
  } = useSectionHandler()

  useEffect(() => {
    if (useMainStore.getState().selectedSlidesIndex.length) {
      useMainStore.getState().updateSelectedSlidesIndex([])
    }
    virtualizer.scrollToIndex(slideIndex, { align: 'auto' })
  }, [slideIndex, virtualizer])

  const changeSlideIndex = useCallback((index: number) => {
    useMainStore.getState().setActiveElementIdList([])
    if (useSlidesStore.getState().slideIndex === index) return
    useSlidesStore.getState().updateSlideIndex(index)
  }, [])

  const handleClickSlideThumbnail = useCallback((e: React.MouseEvent, index: number) => {
    if (editingSectionId) return

    const { selectedSlidesIndex: extraSelected, readOnly: viewOnly } = useMainStore.getState()
    if (viewOnly) {
      // View-only: plain navigation, no multi-selection.
      if (e.button === 0) changeSlideIndex(index)
      return
    }
    const currentIndex = useSlidesStore.getState().slideIndex
    const { ctrlKeyState, shiftKeyState } = useKeyboardStore.getState()
    const selected = [...extraSelected, currentIndex]

    const isMultiSelected = selected.length > 1
    if (isMultiSelected && selected.includes(index) && e.button !== 0) return

    if (ctrlKeyState) {
      if (currentIndex === index) {
        if (!isMultiSelected) return

        const newSelectedSlidesIndex = selected.filter(item => item !== index)
        useMainStore.getState().updateSelectedSlidesIndex(newSelectedSlidesIndex)
        changeSlideIndex(selected[0])
      }
      else {
        if (selected.includes(index)) {
          const newSelectedSlidesIndex = selected.filter(item => item !== index)
          useMainStore.getState().updateSelectedSlidesIndex(newSelectedSlidesIndex)
        }
        else {
          const newSelectedSlidesIndex = [...selected, index]
          useMainStore.getState().updateSelectedSlidesIndex(newSelectedSlidesIndex)
        }
      }
    }
    else if (shiftKeyState) {
      if (currentIndex === index && !isMultiSelected) return

      let minIndex = Math.min(...selected)
      let maxIndex = index

      if (index < minIndex) {
        maxIndex = Math.max(...selected)
        minIndex = index
      }

      const newSelectedSlidesIndex: number[] = []
      for (let i = minIndex; i <= maxIndex; i++) newSelectedSlidesIndex.push(i)
      useMainStore.getState().updateSelectedSlidesIndex(newSelectedSlidesIndex)
    }
    else {
      useMainStore.getState().updateSelectedSlidesIndex([])
      changeSlideIndex(index)
    }
  }, [editingSectionId, changeSlideIndex])

  const setThumbnailsFocus = useCallback((focus: boolean) => {
    if (useMainStore.getState().thumbnailsFocus === focus) return
    useMainStore.getState().setThumbnailsFocus(focus)
    if (!focus) useMainStore.getState().updateSelectedSlidesIndex([])
  }, [])

  useEffect(() => {
    setThumbnailsFocus(true)
  }, [setThumbnailsFocus])

  const blurThumbnails = useCallback(() => setThumbnailsFocus(false), [setThumbnailsFocus])
  useClickOutside(thumbnailsRootRef, blurThumbnails)

  const handleDragEnd = useCallback((eventData: { newIndex: number; oldIndex: number }) => {
    const { newIndex, oldIndex } = eventData
    if (newIndex === undefined || oldIndex === undefined || newIndex === oldIndex) return
    sortSlides(newIndex, oldIndex)
  }, [sortSlides])

  const openNotesPanel = useCallback(() => {
    useMainStore.getState().setNotesPanelState(true)
  }, [])

  const editSection = useCallback((id: string) => {
    if (useMainStore.getState().readOnly) return
    useMainStore.getState().setDisableHotkeysState(true)
    setEditingSectionId(id || 'default')
    Promise.resolve().then(() => {
      const inputRef = queryFika<HTMLInputElement>(`#section-title-input-${id || 'default'}`)
      inputRef?.focus()
    })
  }, [])

  const saveSection = useCallback((e: React.FocusEvent | React.KeyboardEvent) => {
    const title = (e.target as HTMLInputElement).value
    updateSectionTitle(editingSectionId, title)
    setEditingSectionId('')
    useMainStore.getState().setDisableHotkeysState(false)
  }, [editingSectionId, updateSectionTitle])

  const contextmenusSection = useCallback((el: HTMLElement): ContextmenuItem[] | null => {
    if (useMainStore.getState().readOnly) return null
    const sectionId = el.dataset.sectionId!
    const menu = LL.editor.thumbnails.contextMenu
    return [
      { text: menu.deleteSection(), handler: () => removeSection(sectionId) },
      {
        text: menu.deleteSectionAndSlides(),
        handler: () => {
          useMainStore.getState().setActiveElementIdList([])
          removeSectionSlides(sectionId)
        },
      },
      { text: menu.deleteAllSections(), handler: removeAllSection },
      { text: menu.renameSection(), handler: () => editSection(sectionId) },
    ]
  }, [LL, removeSection, removeSectionSlides, removeAllSection, editSection])

  const { enterScreening, enterScreeningFromStart, prefetchScreen } = useScreening()

  const contextmenusThumbnails = useCallback((): ContextmenuItem[] => {
    const menu = LL.editor.thumbnails.contextMenu
    if (useMainStore.getState().readOnly) {
      return [{ text: menu.slideShow(), subText: 'F5', handler: enterScreeningFromStart }]
    }
    return [
      { text: menu.newSlide(), subText: 'Enter', handler: () => createSlide() },
      { text: menu.paste(), subText: 'Ctrl + V', handler: pasteSlide },
      { text: menu.selectAll(), subText: 'Ctrl + A', handler: selectAllSlide },
      { text: menu.slideShow(), subText: 'F5', handler: enterScreeningFromStart },
    ]
  }, [LL, createSlide, pasteSlide, selectAllSlide, enterScreeningFromStart])

  const contextmenusThumbnailItem = useCallback((): ContextmenuItem[] => {
    const menu = LL.editor.thumbnails.contextMenu
    if (useMainStore.getState().readOnly) {
      return [{ text: menu.presentFromCurrent(), subText: 'Shift + F5', handler: () => enterScreening() }]
    }
    return [
      { text: menu.cut(), subText: 'Ctrl + X', handler: cutSlide },
      { text: menu.copy(), subText: 'Ctrl + C', handler: copySlide },
      { text: menu.paste(), subText: 'Ctrl + V', handler: pasteSlide },
      { text: menu.selectAll(), subText: 'Ctrl + A', handler: selectAllSlide },
      { divider: true },
      { text: menu.newSlide(), subText: 'Enter', handler: () => createSlide() },
      { text: menu.duplicateSlide(), subText: 'Ctrl + D', handler: copyAndPasteSlide },
      { text: menu.deleteSlide(), subText: 'Delete', handler: () => deleteSlide() },
      { text: menu.addSection(), handler: createSection, disable: currentSlideHasSection },
      { divider: true },
      { text: menu.presentFromCurrent(), subText: 'Shift + F5', handler: () => enterScreening() },
    ]
  }, [LL, cutSlide, copySlide, pasteSlide, selectAllSlide, createSlide, copyAndPasteSlide, deleteSlide, createSection, currentSlideHasSection, enterScreening])

  const requestAiInsertAtGap = useCallback((spliceIndex: number) => {
    if (useMainStore.getState().readOnly) return
    const state = useSlidesStore.getState()
    const currentSlideId = state.slides[state.slideIndex]?.id ?? null
    const anchor = buildSlideGapAnchor(state.slides, spliceIndex, currentSlideId)
    emitFikaAiSlideInsertRequest(anchor)
  }, [])

  const insertBlankSlideAtGap = useCallback((spliceIndex: number) => {
    if (useMainStore.getState().readOnly) return
    createSlide(spliceIndex)
  }, [createSlide])

  const cancelAiSlide = useCallback((requestId: string, slideId: string) => {
    emitFikaAiSlideInsertCancel({ requestId, slideId })
  }, [])

  railHandlersRef.current = {
    handleClickSlideThumbnail,
    enterScreening,
    contextmenusThumbnailItem,
    contextmenusSection,
    editSection,
    saveSection,
    openNotesPanel,
    requestAiInsertAtGap,
    insertBlankSlideAtGap,
    cancelAiSlide,
  }

  const handleListContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    openContextmenu(event, contextmenusThumbnails)
  }, [contextmenusThumbnails])

  const renderRailItem = useCallback(({ element, index }: { element: { id: string }; index: number }) => (
    <ThumbnailRailItem
      slideId={element.id}
      nextSlideId={slides[index + 1]?.id ?? null}
      index={index}
      totalSlides={slides.length}
      isActive={slideIndex === index}
      isSelected={selectedSlidesSet.has(index)}
      hasSection={hasSection}
      editingSectionId={editingSectionId}
      handlersRef={railHandlersRef}
      sectionNamePlaceholder={sectionLabels.sectionNamePlaceholder}
      untitledSection={sectionLabels.untitledSection}
      defaultSection={sectionLabels.defaultSection}
      thumbSize={dest.cssWidth}
      showGapControls={showGapControls}
      aiDisabled={aiDisabled}
      readOnly={readOnly}
      gapLabels={gapLabels}
    />
  ), [
    slides,
    slideIndex,
    selectedSlidesSet,
    hasSection,
    editingSectionId,
    sectionLabels,
    dest.cssWidth,
    showGapControls,
    aiDisabled,
    readOnly,
    gapLabels,
  ])

  return (
    <div
      ref={thumbnailsRootRef}
      className={cx('thumbnails', className)}
      style={style}
      onPointerEnter={prefetchScreen}
      onMouseDown={() => setThumbnailsFocus(true)}
    >
      {readOnly ? null : <div className={cx('add-slide')}>
        <div className={cx('btn')} onClick={() => createSlide()}>
          <Icon icon="plus" className={cx('icon')} />{LL.editor.thumbnails.addSlide()}
        </div>
        <Popover
          trigger="click"
          placement="bottom-start"
          value={presetLayoutPopoverVisible}
          onUpdateValue={setPresetLayoutPopoverVisible}
          center
          content={
            presetLayoutPopoverVisible
              ? <LayoutPicker onSelect={slide => { createSlideByTemplate(slide); setPresetLayoutPopoverVisible(false) }} />
              : null
          }
        >
          <div className={cx('select-btn')}><Icon icon="chevron-down" /></div>
        </Popover>
      </div>}
      <Draggable
        className={cx('thumbnail-list')}
        modelValue={slides}
        disabled={!!editingSectionId || readOnly}
        itemKey="id"
        scrollRef={scrollRef}
        virtualItems={virtualItems}
        virtualizer={virtualizer}
        totalSize={virtualizer.getTotalSize()}
        onEnd={handleDragEnd}
        overlayRender={slideDragOverlay}
        onContextMenu={handleListContextMenu}
        item={renderRailItem}
      />
      {showGapControls && slides.length === 0 ? (
        <SlideGapBar
          position="before-first"
          spliceIndex={0}
          afterSlideId={null}
          beforeSlideId={null}
          aiDisabled={aiDisabled}
          standalone
          labels={gapLabels}
          onRequestAi={requestAiInsertAtGap}
          onInsertBlank={insertBlankSlideAtGap}
        />
      ) : null}
      <div className={cx('page-number')}>
        {LL.editor.thumbnails.slideCounter({ current: slideIndex + 1, total: slides.length })}
      </div>
      <Modal visible={themeExportDialogVisible} width={420} onClosed={closeThemeExportDialog}>
        {themeForExport ? <ExportThemeDialog data={themeForExport} onClose={closeThemeExportDialog} /> : null}
      </Modal>
    </div>
  )
})

export default Thumbnails
