import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, type CSSProperties, type RefObject } from 'react'

import { useMainStore, useSlidesStore, useKeyboardStore } from '@/store'
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
import { startPreviewRasterSubscription, setVisibleSlideIds } from '@/previewRaster'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import LayoutPicker from './LayoutPicker'
import ExportThemeDialog from './ExportThemeDialog'
import Popover from '@/components/Popover'
import Modal from '@/components/Modal'
import Draggable from '@/components/Draggable'
import { useI18nContext } from '@/i18n/useI18nContext'

type RailHandlers = {
  handleClickSlideThumbnail: (e: React.MouseEvent, index: number) => void
  enterScreening: () => void
  contextmenusThumbnailItem: () => ContextmenuItem[]
  contextmenusSection: (el: HTMLElement) => ContextmenuItem[]
  editSection: (id: string) => void
  saveSection: (e: React.FocusEvent | React.KeyboardEvent) => void
  openNotesPanel: () => void
}

type ThumbnailRailItemProps = {
  slideId: string
  index: number
  isActive: boolean
  isSelected: boolean
  hasSection: boolean
  editingSectionId: string
  handlersRef: RefObject<RailHandlers>
  sectionNamePlaceholder: string
  untitledSection: string
  defaultSection: string
  thumbSize: number
}

function areThumbnailRailItemPropsEqual(prev: ThumbnailRailItemProps, next: ThumbnailRailItemProps) {
  return prev.slideId === next.slideId
    && prev.index === next.index
    && prev.isActive === next.isActive
    && prev.isSelected === next.isSelected
    && prev.hasSection === next.hasSection
    && prev.editingSectionId === next.editingSectionId
    && prev.sectionNamePlaceholder === next.sectionNamePlaceholder
    && prev.untitledSection === next.untitledSection
    && prev.defaultSection === next.defaultSection
    && prev.handlersRef === next.handlersRef
    && prev.thumbSize === next.thumbSize
}

const ThumbnailRailItem = memo(function ThumbnailRailItem({
  slideId,
  index,
  isActive,
  isSelected,
  hasSection,
  editingSectionId,
  handlersRef,
  sectionNamePlaceholder,
  untitledSection,
  defaultSection,
  thumbSize,
}: ThumbnailRailItemProps) {
  const slide = useRailItemSlide(slideId)

  const showSection = !!(slide?.sectionTag || (hasSection && index === 0))
  const sectionId = slide?.sectionTag?.id || ''
  const editingThisSection = editingSectionId === slide?.sectionTag?.id || (index === 0 && editingSectionId === 'default')

  return (
    <div className={cx('thumbnail-container')}>
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
        <ThumbnailSlide className={cx('thumbnail')} slide={{ id: slideId }} size={thumbSize} />
        {slide?.notes && slide.notes.length ? (
          <div className={cx('note-flag')} onClick={() => handlersRef.current.openNotesPanel()}>{slide.notes.length}</div>
        ) : null}
      </div>
    </div>
  )
}, areThumbnailRailItemPropsEqual)

ThumbnailRailItem.displayName = 'ThumbnailRailItem'

const Thumbnails = memo(({ className, style }: { className?: string; style?: CSSProperties }) => {
  const { LL } = useI18nContext()
  const slides = useRailSlideMetas()
  const slideIndex = useSlidesStore(s => s.slideIndex)
  const currentSlideHasSection = useSlidesStore(s => !!s.slides[s.slideIndex]?.sectionTag)
  const _selectedSlidesIndex = useMainStore(s => s.selectedSlidesIndex)
  const selectedSlidesIndex = useMemo(() => [..._selectedSlidesIndex, slideIndex], [_selectedSlidesIndex, slideIndex])
  const hasSection = useMemo(() => slides.some(item => item.sectionTag), [slides])
  const { scrollRef, virtualizer, virtualItems, visibleSlideIds, dest } = useThumbnailVirtualizer(slides, hasSection)
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

    const { selectedSlidesIndex: extraSelected } = useMainStore.getState()
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
    startPreviewRasterSubscription()
    setThumbnailsFocus(true)
  }, [setThumbnailsFocus])

  useEffect(() => {
    setVisibleSlideIds(visibleSlideIds)
  }, [visibleSlideIds])

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

  const contextmenusSection = useCallback((el: HTMLElement): ContextmenuItem[] => {
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
    return [
      { text: menu.newSlide(), subText: 'Enter', handler: createSlide },
      { text: menu.paste(), subText: 'Ctrl + V', handler: pasteSlide },
      { text: menu.selectAll(), subText: 'Ctrl + A', handler: selectAllSlide },
      { text: menu.slideShow(), subText: 'F5', handler: enterScreeningFromStart },
    ]
  }, [LL, createSlide, pasteSlide, selectAllSlide, enterScreeningFromStart])

  const contextmenusThumbnailItem = useCallback((): ContextmenuItem[] => {
    const menu = LL.editor.thumbnails.contextMenu
    return [
      { text: menu.cut(), subText: 'Ctrl + X', handler: cutSlide },
      { text: menu.copy(), subText: 'Ctrl + C', handler: copySlide },
      { text: menu.paste(), subText: 'Ctrl + V', handler: pasteSlide },
      { text: menu.selectAll(), subText: 'Ctrl + A', handler: selectAllSlide },
      { divider: true },
      { text: menu.newSlide(), subText: 'Enter', handler: createSlide },
      { text: menu.duplicateSlide(), subText: 'Ctrl + D', handler: copyAndPasteSlide },
      { text: menu.deleteSlide(), subText: 'Delete', handler: () => deleteSlide() },
      { text: menu.addSection(), handler: createSection, disable: currentSlideHasSection },
      { divider: true },
      { text: menu.presentFromCurrent(), subText: 'Shift + F5', handler: () => enterScreening() },
    ]
  }, [LL, cutSlide, copySlide, pasteSlide, selectAllSlide, createSlide, copyAndPasteSlide, deleteSlide, createSection, currentSlideHasSection, enterScreening])

  railHandlersRef.current = {
    handleClickSlideThumbnail,
    enterScreening,
    contextmenusThumbnailItem,
    contextmenusSection,
    editSection,
    saveSection,
    openNotesPanel,
  }

  return (
    <div
      ref={thumbnailsRootRef}
      className={cx('thumbnails', className)}
      style={style}
      onPointerEnter={prefetchScreen}
      onMouseDown={() => setThumbnailsFocus(true)}
    >
      <div className={cx('add-slide')}>
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
            <LayoutPicker onSelect={slide => { createSlideByTemplate(slide); setPresetLayoutPopoverVisible(false) }} />
          }
        >
          <div className={cx('select-btn')}><Icon icon="chevron-down" /></div>
        </Popover>
      </div>
      <Draggable
        className={cx('thumbnail-list')}
        modelValue={slides}
        disabled={!!editingSectionId}
        itemKey="id"
        scrollRef={scrollRef}
        virtualItems={virtualItems}
        virtualizer={virtualizer}
        totalSize={virtualizer.getTotalSize()}
        onEnd={handleDragEnd}
        onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openContextmenu(event, contextmenusThumbnails) }}
        item={({ element, index }) => (
          <ThumbnailRailItem
            slideId={element.id}
            index={index}
            isActive={slideIndex === index}
            isSelected={selectedSlidesIndex.includes(index)}
            hasSection={hasSection}
            editingSectionId={editingSectionId}
            handlersRef={railHandlersRef}
            sectionNamePlaceholder={LL.editor.thumbnails.sectionNamePlaceholder()}
            untitledSection={LL.editor.thumbnails.untitledSection()}
            defaultSection={LL.editor.thumbnails.defaultSection()}
            thumbSize={dest.cssWidth}
          />
        )}
      />
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
