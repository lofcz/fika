import { bindStyles } from '@/utils/cssm'
import { useMainStore, selectHandleElement } from '@/store'
import styles from './SymbolPool.module.scss'
const cx = bindStyles(styles)
import { useRef, useState, useEffect, type CSSProperties } from 'react'
import {
  EMOJI_TYPE_ICONS,
  EMOJI_TYPE_KEYS,
  SYMBOL_CATEGORY_KEYS,
  getCachedSymbolItems,
  loadSymbolItems,
  prefetchSymbolItems,
  type EmojiTypeKey,
  type SymbolCategoryKey,
} from '@/configs/symbol'
import { useI18nContext } from '@/i18n/useI18nContext'
import emitter, { EmitterEvents } from '@/utils/emitter'
import { queryFika } from '@/utils/portal'
import useCreateElement from '@/hooks/useCreateElement'
import VirtualSymbolGrid from './VirtualSymbolGrid'

export type ISymbolPoolProps = {
  className?: string
  style?: CSSProperties
  onSelect?: () => void
}

export default function SymbolPool(props: ISymbolPoolProps) {
  const { LL } = useI18nContext()
  const { createTextElement } = useCreateElement()

  const [selectedSymbolKey, setSelectedSymbolKey] = useState<SymbolCategoryKey>('emoji')
  const [selectedEmojiType, setSelectedEmojiType] = useState<EmojiTypeKey>('expression')
  const [items, setItems] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const loadSeq = useRef(0)
  const poolKey = `${selectedSymbolKey}:${selectedEmojiType}`
  const [appliedPoolKey, setAppliedPoolKey] = useState(poolKey)
  if (appliedPoolKey !== poolKey) {
    setAppliedPoolKey(poolKey)
    setItems([])
    setLoading(true)
  }

  const afterPaint = (fn: () => void) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(fn)
    })
  }

  const emojiTypeList = (() => {
    const types = LL.editor.symbolPanel.emojiTypes
    return {
      expression: types.expression(),
      action: types.action(),
      faunaFlora: types.faunaFlora(),
      food: types.food(),
      travel: types.travel(),
      activity: types.activity(),
      objects: types.objects(),
      symbols: types.symbols(),
    }
  })()

  const emojiTypeTabs = EMOJI_TYPE_KEYS.map(key => ({
    key,
    icon: EMOJI_TYPE_ICONS[key],
    label: emojiTypeList[key],
  }))

  const tabs = (() => {
    const symbols = LL.configs.symbols
    const labels: Record<SymbolCategoryKey, () => string> = {
      emoji: symbols.emoji,
      letter: symbols.letter,
      number: symbols.number,
      math: symbols.math,
      arrow: symbols.arrow,
      graph: symbols.graph,
    }
    return SYMBOL_CATEGORY_KEYS.map(key => ({
      key,
      label: labels[key](),
    }))
  })()

  const loadActivePool = () => {
    const category = selectedSymbolKey
    const emojiType = selectedEmojiType
    const seq = ++loadSeq.current
    const cached = getCachedSymbolItems(category, emojiType)

    setLoading(true)
    setItems([])

    const apply = (nextItems: string[]) => {
      if (seq !== loadSeq.current) return
      setItems(nextItems)
      setLoading(false)
    }

    if (cached) {
      afterPaint(() => apply(cached))
      return
    }

    void loadSymbolItems(category, emojiType).then(apply)
  }

  useEffect(() => {
    loadActivePool()
  }, [selectedSymbolKey, selectedEmojiType])

  const selectSymbol = (value: string) => {
    const current = selectHandleElement(useMainStore.getState())

    if (current?.type === 'text') {
      emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command: 'insert', value } })
      props.onSelect?.()
      return
    }
    if (current?.type === 'shape') {
      const editableElRef = queryFika(`#editable-element-${current.id} .ProseMirror`)
      if (editableElRef) {
        emitter.emit(EmitterEvents.RICH_TEXT_COMMAND, { action: { command: 'insert', value } })
        props.onSelect?.()
        return
      }
    }
    if (current?.type === 'table') {
      const editableElRef = queryFika<HTMLElement>(`#editable-element-${current.id} .cell.active .cell-text`)
      if (editableElRef) {
        document.execCommand('insertText', false, value)
        props.onSelect?.()
        return
      }
    }

    createTextElement({
      left: 0,
      top: 0,
      width: 200,
      height: 50,
    }, { content: value })
    props.onSelect?.()
  }

  return (
    <div
      className={cx('symbol-pool', props.className)}
      style={props.style}
      onMouseDown={event => event.preventDefault()}
    >
      <div className={cx('category-tabs')} role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={cx('category-tab', { active: tab.key === selectedSymbolKey })}
            aria-selected={tab.key === selectedSymbolKey}
            onClick={() => setSelectedSymbolKey(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {selectedSymbolKey === 'emoji' ? (
        <div className={cx('emoji-types')} role="tablist">
          {emojiTypeTabs.map(item => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className={cx('emoji-type', { active: selectedEmojiType === item.key })}
              aria-selected={selectedEmojiType === item.key}
              aria-label={item.label}
              data-tooltip={item.label}
              onMouseEnter={() => prefetchSymbolItems('emoji', item.key)}
              onClick={() => setSelectedEmojiType(item.key)}
            >
              <span className={cx('emoji-type-icon')}>{item.icon}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className={cx('pool')}>
        <VirtualSymbolGrid
          items={items}
          emoji={selectedSymbolKey === 'emoji'}
          loading={loading}
          onSelect={selectSymbol}
        />
      </div>
    </div>
  )
}
