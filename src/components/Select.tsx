import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './Select.module.scss'
const cx = bindStyles(styles)
import { type CSSProperties, type ReactNode, useRef, memo, useState, useEffect } from 'react'

import { useI18nContext } from '@/i18n/useI18nContext'
import Popover from './Popover'
import Input from './Input'
import FitText from './FitText'

interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

export type ISelectProps = {
  value: string | number
  options: SelectOption[]
  disabled?: boolean
  autofocus?: boolean
  defaultLabel?: string
  search?: boolean
  searchLabel?: string
  previewFonts?: boolean
  onUpdateValue?: (payload: string | number) => void
  icon?: ReactNode
  className?: string
  style?: CSSProperties
  'data-tooltip'?: string
}

const Select = memo((vrProps: ISelectProps) => {
  const { LL } = useI18nContext()
  const {
    value,
    options,
    disabled = false,
    defaultLabel = '',
    search = false,
    searchLabel,
    previewFonts = false,
    onUpdateValue,
    icon,
    className,
    style,
    'data-tooltip': dataTooltip,
  } = vrProps

  const effectiveSearchLabel = searchLabel ?? LL.common.search()
  const [popoverVisible, setPopoverVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const [searchKey, setSearchKey] = useState('')
  const selectRef = useRef<HTMLDivElement | null>(null)
  const optionsRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<{ focus: () => void } | null>(null)
  const [previewedFonts, setPreviewedFonts] = useState(new Set<string>())
  const previewedFontsRef = useRef(previewedFonts)
  previewedFontsRef.current = previewedFonts
  const fontObserverRef = useRef<IntersectionObserver | null>(null)

  const fontFamilyCss = (next: string | number) => {
    const family = String(next).trim()
    if (!family) return undefined
    return family.includes(' ') ? `"${family}"` : family
  }

  const previewStyle = (next: string | number, requireVisible = true): CSSProperties | undefined => {
    if (!previewFonts) return undefined
    const family = fontFamilyCss(next)
    if (!family) return undefined
    if (requireVisible && !previewedFonts.has(String(next))) return undefined
    return { fontFamily: family }
  }

  const showLabel = options.find(item => item.value === value)?.label || defaultLabel || value

  const showOptions = (() => {
    if (!search) return options
    if (!searchKey.trim()) return options
    const opts = options.filter(item => item.label.toLowerCase().indexOf(searchKey.toLowerCase()) !== -1)
    return opts.length ? opts : options
  })()

  const scrollSelectedIntoPlace = (container: HTMLElement) => {
    const selected = container.querySelector('.option.selected') as HTMLElement | null
    if (!selected) return
    const top = selected.offsetTop - (container.clientHeight - selected.offsetHeight) / 2
    container.scrollTop = Math.max(0, top)
  }

  const teardownFontObserver = () => {
    fontObserverRef.current?.disconnect()
    fontObserverRef.current = null
  }

  const observeFontOptions = (container: HTMLElement) => {
    if (!fontObserverRef.current) return
    container.querySelectorAll<HTMLElement>('.option[data-font]').forEach(node => {
      const key = node.dataset.font
      if (!key || previewedFontsRef.current.has(key)) return
      fontObserverRef.current!.observe(node)
    })
  }

  const setupFontObserver = (container: HTMLElement) => {
    teardownFontObserver()
    if (!previewFonts) return

    fontObserverRef.current = new IntersectionObserver((entries) => {
      let changed = false
      const next = new Set(previewedFontsRef.current)
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const key = (entry.target as HTMLElement).dataset.font
        if (!key || next.has(key)) continue
        next.add(key)
        changed = true
        fontObserverRef.current?.unobserve(entry.target)
      }
      if (changed) setPreviewedFonts(next)
    }, {
      root: container,
      rootMargin: '72px 0px',
      threshold: 0,
    })

    observeFontOptions(container)
  }

  const revealOptions = (node: HTMLElement) => {
    node.style.visibility = 'hidden'
    const reveal = () => {
      if (optionsRef.current !== node) return
      scrollSelectedIntoPlace(node)
      node.style.visibility = ''
      setupFontObserver(node)
    }
    if (node.clientHeight > 0) reveal()
    else requestAnimationFrame(reveal)
  }

  const bindOptionsEl = (el: HTMLDivElement | null) => {
    const node = el instanceof HTMLElement ? el : null
    optionsRef.current = node
    teardownFontObserver()
    if (!node) return
    revealOptions(node)
  }

  useEffect(() => {
    if (popoverVisible) {
      Promise.resolve().then(() => {
        const active = document.activeElement
        if (!(active instanceof HTMLElement && active.isContentEditable)) searchInputRef.current?.focus()
        if (optionsRef.current) revealOptions(optionsRef.current)
      })
    }
    else {
      setSearchKey('')
      setPreviewedFonts(new Set())
    }
  }, [popoverVisible])

  useEffect(() => {
    if (!previewFonts || !optionsRef.current || !fontObserverRef.current) return
    Promise.resolve().then(() => {
      if (optionsRef.current) observeFontOptions(optionsRef.current)
    })
  }, [search, searchKey, options, previewFonts])

  const updateWidth = () => {
    if (!selectRef.current) return
    setWidth(selectRef.current.clientWidth)
  }

  useEffect(() => {
    const el = selectRef.current
    if (!el) return
    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(el)
    return () => {
      teardownFontObserver()
      resizeObserver.disconnect()
    }
  }, [disabled])

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return
    onUpdateValue?.(option.value)
    setPopoverVisible(false)
  }

  const keepEditorFocus = (event: { preventDefault: () => void }) => {
    event.preventDefault()
  }

  const trigger = (
    <div className={cx('select', disabled && 'disabled')} ref={selectRef} data-tooltip={dataTooltip} onMouseDown={keepEditorFocus}>
      <div className={cx('selector')} style={previewStyle(value, false)}>
        {previewFonts
          ? <span className={cx('option-label')}>{showLabel}</span>
          : <FitText text={String(showLabel)} maxFontSize={13} minFontSize={10} />}
      </div>
      <div className={cx('icon')}>
        {icon ?? <Icon icon="chevron-down" />}
      </div>
    </div>
  )

  if (disabled) {
    return (
      <div className={cx('select-wrap', className)} style={style} data-tooltip={dataTooltip}>
        {trigger}
      </div>
    )
  }

  return (
    <Popover
      className={cx('select-wrap', className)}
      style={style}
      trigger="click"
      value={popoverVisible}
      onUpdateValue={(next: boolean) => setPopoverVisible(next)}
      placement="bottom"
      contentStyle={{ padding: 0 }}
      content={(
        <div className={cx('select-dropdown')} style={{ width: Math.max(width, 160) + 'px' }}>
          {search ? (
            <div className={cx('search-row')}>
              <Input
                ref={searchInputRef}
                placeholder={effectiveSearchLabel}
                value={searchKey}
                onUpdateValue={(next: string) => setSearchKey(next)}
                prefix={<Icon icon="search" className={cx('search-icon')} />}
              />
            </div>
          ) : null}
          <div className={cx('options')} ref={bindOptionsEl}>
            {showOptions.map(option => (
              <div
                className={cx('option', {
                  disabled: option.disabled,
                  selected: option.value === value,
                  'preview-font': previewFonts,
                })}
                key={option.value}
                data-font={previewFonts ? String(option.value) : undefined}
                style={previewStyle(option.value)}
                onMouseDown={keepEditorFocus}
                onClick={() => handleSelect(option)}
              >
                {previewFonts
                  ? <span className={cx('option-label')}>{option.label}</span>
                  : <FitText text={option.label} maxFontSize={13} minFontSize={10} />}
              </div>
            ))}
          </div>
        </div>
      )}
    >
      {trigger}
    </Popover>
  )
})

export default Select
