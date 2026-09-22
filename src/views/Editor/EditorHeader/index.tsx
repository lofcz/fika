import { bindStyles } from '@/utils/cssm'
import { Icon, type IconName } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useCallback, memo, useState, useEffect, type CSSProperties, type ReactNode } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import { getImportApi } from '@/hooks/useImport'
import useScreening from '@/hooks/useScreening'
import useSlideHandler from '@/hooks/useSlideHandler'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import { nanoid } from 'nanoid'
import type { DialogForExportTypes } from '@/types/export'
import { getFikaHeaderMenuItems } from '@/configs/headerMenu'
import { isFikaLocaleSwitcherEnabled } from '@/configs/localeSwitcher'
import type { FikaHeaderMenuItem } from '@/embed/types'
import { applyLocale } from '@/embed/localeBridge'
import type { Locales } from '@/i18n/locale'
import HotkeyDoc from './HotkeyDoc'
import Drawer from '@/components/Drawer'
import Popover from '@/components/Popover'
import PopoverMenuItem from '@/components/PopoverMenuItem'
import Divider from '@/components/Divider'
import { useI18nContext } from '@/i18n/useI18nContext'
import { EXTRAS_ENABLED } from '@/configs/featureFlags'
import { isMac } from '@/utils/common'
import ConfirmDialog from '@/components/ConfirmDialog'

const LOCALE_ORDER: Locales[] = ['en', 'cs', 'sk', 'pl']

const HOST_MENU_ICONS = new Set([
  'link',
  'share-2',
  'globe',
  'cloud',
])

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

const importPickedFiles = (files: FileList) => {
  const file = files[0]
  if (!file) return
  const { importJSON, importPPTXFile } = getImportApi()
  const name = file.name.toLowerCase()
  if (name.endsWith('.json') || file.type === 'application/json') importJSON(files)
  else if (name.endsWith('.pptx') || file.type === PPTX_MIME) importPPTXFile(files)
}

const HeaderTitle = memo(({ myna = false }: { myna?: boolean }) => {
  const { LL } = useI18nContext()
  const readOnly = useMainStore(s => s.readOnly)
  const title = useSlidesStore(s => s.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const commitTitleOnBlur = useRef(true)
  const [titleValue, setTitleValue] = useState(title)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const titleActivatedByPointer = useRef(false)
  const titleSizer = `${titleValue}\u00a0`

  useEffect(() => {
    if (!editingTitle) setTitleValue(title)
  }, [title, editingTitle])

  const onTitlePointerDown = () => {
    titleActivatedByPointer.current = true
  }

  const startEditTitle = useCallback(() => {
    const byPointer = titleActivatedByPointer.current
    titleActivatedByPointer.current = false
    if (editingTitle) return
    setEditingTitle(true)
    commitTitleOnBlur.current = true
    if (byPointer) return
    Promise.resolve().then(() => {
      const input = titleInputRef.current
      if (!input) return
      const end = input.value.length
      input.setSelectionRange(end, end)
    })
  }, [editingTitle])

  const onTitleInput = useCallback((event: React.FormEvent<HTMLInputElement>) => {
    setTitleValue(event.currentTarget.value)
  }, [])

  const handleUpdateTitle = useCallback(() => {
    if (commitTitleOnBlur.current) useSlidesStore.getState().setTitle(titleValue)
    else setTitleValue(title)
    commitTitleOnBlur.current = true
    setEditingTitle(false)
  }, [titleValue, title])

  const cancelEditTitle = useCallback(() => {
    commitTitleOnBlur.current = false
    setTitleValue(title)
    titleInputRef.current?.blur()
  }, [title])

  return (
    <div className={cx('title')} data-value={titleSizer}>
      <input
        ref={titleInputRef}
        className={cx('title-field', { editing: editingTitle })}
        value={titleValue}
        title={title}
        aria-label={myna ? LL.myna.designTitle() : undefined}
        readOnly={readOnly}
        maxLength={200}
        spellCheck={false}
        onMouseDown={onTitlePointerDown}
        onFocus={startEditTitle}
        onInput={onTitleInput}
        onBlur={handleUpdateTitle}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            titleInputRef.current?.blur()
          }
          else if (event.key === 'Escape') {
            event.preventDefault()
            cancelEditTitle()
          }
        }}
      />
    </div>
  )
})

const EditorHeader = memo(({ className, style, myna = false, children }: {
  className?: string
  style?: CSSProperties
  myna?: boolean
  children?: ReactNode
}) => {
  const { LL, locale, setLocale } = useI18nContext()
  const { enterScreening, enterScreeningFromStart, prefetchScreen } = useScreening()
  const { resetSlides } = useSlideHandler()
  const { addHistorySnapshot } = useHistorySnapshot()
  const resetDocument = useCallback(() => {
    if (!myna) { resetSlides(); return }
    const slides = useSlidesStore.getState()
    const main = useMainStore.getState()
    main.setActiveElementIdList([])
    main.updateSelectedSlidesIndex([])
    main.setHiddenElementIdList([])
    slides.updateSlideIndex(0)
    slides.setSlides([{ id: nanoid(10), elements: [], background: { type: 'solid', color: '#ffffff' } }])
    slides.setTitle(LL.myna.untitled())
    addHistorySnapshot()
  }, [myna, resetSlides, addHistorySnapshot, LL])
  const slideCount = useSlidesStore(s => s.slides.length)
  const readOnly = useMainStore(s => s.readOnly)
  const isMacOS = isMac()

  const localeSwitcherEnabled = isFikaLocaleSwitcherEnabled()
  const [localeMenuVisible, setLocaleMenuVisible] = useState(false)
  const localeOptions = useMemo(() => {
    const names = LL.editor.header.locales
    return LOCALE_ORDER.map(id => ({ id, label: names[id]() }))
  }, [LL])

  const persistLocaleInUrl = (next: Locales) => {
    if (document.querySelector('.fika-embed-root')) return
    const url = new URL(window.location.href)
    url.searchParams.set('locale', next)
    history.replaceState(null, '', url)
  }

  const switchLocale = useCallback(async (next: Locales) => {
    setLocaleMenuVisible(false)
    if (next === locale) return
    persistLocaleInUrl(next)
    await applyLocale(next)
    setLocale(next)
  }, [locale, setLocale])

  const [mainMenuVisible, setMainMenuVisible] = useState(false)
  const [screeningMenuVisible, setScreeningMenuVisible] = useState(false)
  const [hotkeyDrawerVisible, setHotkeyDrawerVisible] = useState(false)
  const [newPresentationOpen, setNewPresentationOpen] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const openImportPicker = useCallback(() => {
    const input = importInputRef.current
    if (!input) return
    input.value = ''
    input.click()
  }, [])

  const handleImportInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.[0]) importPickedFiles(files)
    setMainMenuVisible(false)
  }, [])

  const goLink = useCallback((url: string) => {
    window.open(url)
    setMainMenuVisible(false)
  }, [])

  const setDialogForExport = useCallback((type: DialogForExportTypes) => {
    useMainStore.getState().setDialogForExport(type)
    setMainMenuVisible(false)
  }, [])

  const openMarkupPanel = useCallback(() => {
    useMainStore.getState().setMarkupPanelState(true)
  }, [])

  const isBlankDeck = () => {
    const slides = useSlidesStore.getState().slides
    return slides.length === 0 || (slides.length === 1 && slides[0].elements.length === 0)
  }

  const requestNewPresentation = useCallback(() => {
    setMainMenuVisible(false)
    if (isBlankDeck()) {
      resetDocument()
      return
    }
    setNewPresentationOpen(true)
  }, [resetDocument])

  const confirmNewPresentation = useCallback(() => {
    resetDocument()
    setNewPresentationOpen(false)
  }, [resetDocument])

  const hostMenuItems = getFikaHeaderMenuItems()

  const hostMenuItemIcon = (item: FikaHeaderMenuItem): IconName | null => {
    return (item.icon && HOST_MENU_ICONS.has(item.icon)) ? item.icon as IconName : null
  }

  const handleHostMenuItem = useCallback((item: FikaHeaderMenuItem) => {
    setScreeningMenuVisible(false)
    setMainMenuVisible(false)
    item.onSelect?.(item.id)
  }, [])

  const mainMenuContent = useMemo(() => (
    <>
      <PopoverMenuItem className={cx('popover-menu-item')} onClick={openImportPicker}>
        <Icon icon="upload" className={cx('icon')} /> {LL.editor.header.importFiles()}
      </PopoverMenuItem>
      <PopoverMenuItem className={cx('popover-menu-item')} onClick={() => setDialogForExport('pptx')}>
        <Icon icon="download" className={cx('icon')} /> {LL.editor.header.exportFiles()}
      </PopoverMenuItem>
      <Divider margin={10} />
      <PopoverMenuItem
        className={cx('popover-menu-item')}
        onClick={requestNewPresentation}
      >
        <Icon icon="file-plus" className={cx('icon')} /> {myna ? LL.myna.newDesign() : LL.editor.header.resetSlides()}
      </PopoverMenuItem>
      <PopoverMenuItem
        className={cx('popover-menu-item')}
        onClick={() => {
          openMarkupPanel()
          setMainMenuVisible(false)
        }}
      >
        <Icon icon="bookmark" className={cx('icon')} /> {LL.editor.header.markupSlides()}
      </PopoverMenuItem>
      <PopoverMenuItem
        className={cx('popover-menu-item')}
        onClick={() => {
          setMainMenuVisible(false)
          setHotkeyDrawerVisible(true)
        }}
      >
        {isMacOS
          ? <Icon icon="terminal" className={cx('icon')} />
          : <Icon icon="keyboard" className={cx('icon')} />}
        {LL.editor.header.hotkeys()}
      </PopoverMenuItem>
      {EXTRAS_ENABLED ? (
        <>
          <PopoverMenuItem className={cx('popover-menu-item')} onClick={() => goLink('https://github.com/lofcz/fika/issues')}>
            <Icon icon="message-square" className={cx('icon')} /> {LL.editor.header.feedback()}
          </PopoverMenuItem>
          <PopoverMenuItem className={cx('popover-menu-item')} onClick={() => goLink('https://github.com/lofcz/fika/blob/master/doc/Q&A.md')}>
            <Icon icon="circle-help" className={cx('icon')} /> {LL.editor.header.faq()}
          </PopoverMenuItem>
          <Divider margin={10} />
          <div className={cx('statement')}>{LL.editor.header.demoDisclaimer()}</div>
        </>
      ) : null}
    </>
  ), [LL, myna, goLink, isMacOS, openImportPicker, openMarkupPanel, requestNewPresentation, setDialogForExport])

  const screeningMenuContent = useMemo(() => (
    <>
      <PopoverMenuItem className={cx('popover-menu-item')} onClick={() => { setMainMenuVisible(false); setScreeningMenuVisible(false); enterScreeningFromStart() }}>
        <Icon icon="presentation" className={cx('icon')} /> {LL.editor.header.screenFromStart()}
      </PopoverMenuItem>
      <PopoverMenuItem className={cx('popover-menu-item')} onClick={() => { setMainMenuVisible(false); setScreeningMenuVisible(false); enterScreening() }}>
        <Icon icon="presentation" className={cx('icon')} /> {LL.editor.header.screenFromCurrent()}
      </PopoverMenuItem>
      {hostMenuItems.length ? (
        <>
          <Divider margin={5} />
          {hostMenuItems.map(item => (
            <PopoverMenuItem
              key={item.id}
              className={cx('popover-menu-item')}
              onClick={() => handleHostMenuItem(item)}
            >
              {hostMenuItemIcon(item) ? <Icon icon={hostMenuItemIcon(item)!} className={cx('icon')} /> : null}
              {item.label}
            </PopoverMenuItem>
          ))}
        </>
      ) : null}
    </>
  ), [LL, enterScreening, enterScreeningFromStart, handleHostMenuItem, hostMenuItems])

  const localeMenuContent = useMemo(() => localeOptions.map(item => (
    <PopoverMenuItem
      key={item.id}
      className={cx('popover-menu-item', 'locale-option', { active: locale === item.id })}
      onClick={() => switchLocale(item.id)}
    >
      {item.label}
    </PopoverMenuItem>
  )), [locale, localeOptions, switchLocale])

  return (
    <div className={cx('editor-header', className, { 'myna-header': myna })} style={style} data-myna-header={myna || undefined}>
      <div className={cx('left', { 'read-only': readOnly && !myna })}>
        <Popover
          trigger="click"
          placement="bottom-start"
          value={mainMenuVisible}
          onUpdateValue={setMainMenuVisible}
          content={myna ? <>{readOnly ? <PopoverMenuItem className={cx('popover-menu-item')} onClick={() => setDialogForExport('pptx')}><Icon icon="download" className={cx('icon')} />{LL.editor.header.exportFiles()}</PopoverMenuItem> : mainMenuContent}<Divider margin={10} />{screeningMenuContent}</> : mainMenuContent}
        >
          <button type="button" className={cx('menu-item', 'menu-button')} aria-label={myna ? LL.myna.fileMenu() : LL.editor.header.importFiles()} aria-expanded={mainMenuVisible}><Icon icon="menu" className={cx('icon')} /></button>
        </Popover>

        <HeaderTitle myna={myna} />
      </div>

      <div className={cx('right')}>
        {!myna ? <><div className={cx('group-menu-item')}>
          <div className={cx('menu-item')} data-editor-tool="present" data-tooltip={LL.editor.header.screeningTooltip()} onPointerEnter={prefetchScreen} onClick={() => enterScreening()}>
            <Icon icon="presentation" className={cx('icon')} />
          </div>
          <Popover
            trigger="click"
            placement="bottom-start"
            center
            value={screeningMenuVisible}
            onUpdateValue={setScreeningMenuVisible}
            content={screeningMenuContent}
          >
            <div className={cx('arrow-btn')}><Icon icon="chevron-down" className={cx('arrow')} /></div>
          </Popover>
        </div>
        <div className={cx('menu-item')} data-editor-tool="export" data-tooltip={LL.editor.header.exportTooltip()} onClick={() => setDialogForExport('pptx')}>
          <Icon icon="download" className={cx('icon')} />
        </div>
        </> : null}
        {EXTRAS_ENABLED && !myna ? (
          <a
            className={cx('github-link')}
            data-tooltip="Copyright © 2020-PRESENT pipipi-pikachu"
            href="https://github.com/lofcz/fika"
            target="_blank"
          >
            <div className={cx('menu-item')}><Icon icon="github" className={cx('icon')} /></div>
          </a>
        ) : null}
        {localeSwitcherEnabled ? (
          <Popover
            trigger="click"
            placement="bottom-start"
            value={localeMenuVisible}
            onUpdateValue={setLocaleMenuVisible}
            content={localeMenuContent}
          >
            <button type="button" className={cx('menu-item', 'menu-button')} aria-label={LL.editor.header.localeTooltip()} aria-expanded={localeMenuVisible} data-tooltip={LL.editor.header.localeTooltip()}>
              <span className={cx('locale-code')}>{locale.toUpperCase()}</span>
            </button>
          </Popover>
        ) : null}
        {children}
      </div>

      <Drawer
        width={400}
        visible={hotkeyDrawerVisible}
        onUpdateVisible={setHotkeyDrawerVisible}
        placement="right"
        title={LL.editor.header.hotkeys()}
      >
        <HotkeyDoc />
      </Drawer>

      <input
        ref={importInputRef}
        className={cx('hidden-import-input')}
        type="file"
        accept=".pptx,.json,application/vnd.openxmlformats-officedocument.presentationml.presentation"
        onChange={handleImportInputChange}
      />

      <ConfirmDialog
        visible={newPresentationOpen}
        icon="file-plus"
        kicker={myna ? LL.myna.resetConfirm.kicker() : LL.editor.header.resetConfirm.kicker()}
        title={myna ? LL.myna.resetConfirm.title() : LL.editor.header.resetConfirm.title()}
        description={myna ? LL.myna.resetConfirm.description({ count: slideCount }) : LL.editor.header.resetConfirm.description({ count: slideCount })}
        actionTitle={myna ? LL.myna.resetConfirm.actionTitle() : LL.editor.header.resetConfirm.actionTitle()}
        actionHint={myna ? LL.myna.resetConfirm.actionHint() : LL.editor.header.resetConfirm.actionHint()}
        cancelLabel={LL.common.cancel()}
        onConfirm={confirmNewPresentation}
        onCancel={() => setNewPresentationOpen(false)}
      />
    </div>
  )
})

export default EditorHeader
