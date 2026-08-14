import { bindStyles } from '@/utils/cssm'
import styles from './AnimationPool.module.scss'
const cx = bindStyles(styles)
import { useCallback, useMemo, memo, useState, useEffect } from 'react'

import { ANIMATION_CLASS_PREFIX, type AnimationPreset, type AnimationPresetGroup } from '@/configs/animation'
import type { AnimationType } from '@/types/slides'

export type IAnimationPoolProps = {
  activeTab: AnimationType
  tabs: {
    key: AnimationType
    label: string
  }[]
  groups: AnimationPresetGroup[]
  previewReady?: boolean
  currentEffect?: string
} & {
  onUpdateActiveTab?: (payload: AnimationType) => void
  onPick?: (payload: string) => void
}

const FAMILY_ORDER = ['fade', 'slide', 'bounce', 'zoom', 'rotate', 'back', 'flip', 'lightSpeed']

const AnimationPool = memo((props: IAnimationPoolProps) => {
  const {
    activeTab,
    tabs,
    groups,
    previewReady = true,
    currentEffect = '',
    onUpdateActiveTab,
    onPick,
  } = props

  const [family, setFamily] = useState('fade')
  const [preview, setPreview] = useState('')
  const [hint, setHint] = useState('')

  const byValue = (group: AnimationPresetGroup) => Object.fromEntries(group.children.map(child => [child.value, child]))
  const pick = (group: AnimationPresetGroup, keys: (string | null)[]) => {
    const map = byValue(group)
    return keys.map(key => key ? map[key] ?? null : null)
  }
  const prefixFor = (group: AnimationPresetGroup) => {
    const sample = group.children[0]?.value ?? ''
    const verb = /Out/.test(sample) ? 'Out' : 'In'
    const prefixes: Record<string, string> = {
      fade: `fade${verb}`,
      bounce: `bounce${verb}`,
      rotate: `rotate${verb}`,
      zoom: `zoom${verb}`,
      slide: `slide${verb}`,
      back: `back${verb}`,
      flip: `flip${verb}`,
      lightSpeed: `lightSpeed${verb}`,
    }
    return prefixes[group.type] ?? sample
  }

  const directionalGroups = useMemo(() => {
    const laidOut = groups.map(group => {
      const prefix = prefixFor(group)
      if (group.type === 'fade') {
        return {
          type: group.type,
          name: group.name,
          kind: 'pad' as const,
          cols: 3 as const,
          cells: pick(group, [`${prefix}TopLeft`, `${prefix}Down`, `${prefix}TopRight`, `${prefix}Left`, prefix, `${prefix}Right`, `${prefix}BottomLeft`, `${prefix}Up`, `${prefix}BottomRight`]),
        }
      }
      if (group.type === 'bounce' || group.type === 'zoom' || group.type === 'back') {
        const center = group.type === 'back' ? null : prefix
        return {
          type: group.type,
          name: group.name,
          kind: 'pad' as const,
          cols: 3 as const,
          cells: pick(group, [null, `${prefix}Down`, null, `${prefix}Left`, center, `${prefix}Right`, null, `${prefix}Up`, null]),
        }
      }
      if (group.type === 'rotate') {
        return {
          type: group.type,
          name: group.name,
          kind: 'pad' as const,
          cols: 3 as const,
          cells: pick(group, [`${prefix}UpLeft`, null, `${prefix}UpRight`, null, prefix, null, `${prefix}DownLeft`, null, `${prefix}DownRight`]),
        }
      }
      if (group.type === 'slide' || group.type === 'lightSpeed') {
        return {
          type: group.type,
          name: group.name,
          kind: 'pad' as const,
          cols: 3 as const,
          cells: pick(group, [null, group.type === 'slide' ? `${prefix}Down` : null, null, `${prefix}Left`, null, `${prefix}Right`, null, group.type === 'slide' ? `${prefix}Up` : null, null]),
        }
      }
      return {
        type: group.type,
        name: group.name,
        kind: 'row' as const,
        cols: Math.min(4, Math.max(2, group.children.length)) as 2 | 3 | 4,
        cells: group.children,
      }
    })
    return [...laidOut].sort((a, b) => FAMILY_ORDER.indexOf(a.type) - FAMILY_ORDER.indexOf(b.type))
  }, [groups])

  const activeGroup = directionalGroups.find(group => group.type === family) ?? directionalGroups[0]
  const attentionItems = useMemo(() => groups.flatMap(group => group.children), [groups])

  const syncFamilyFromEffect = useCallback(() => {
    if (currentEffect) {
      const match = directionalGroups.find(group => group.cells.some(cell => cell?.value === currentEffect))
      if (match) {
        setFamily(match.type)
        return
      }
    }
    setFamily(prev => directionalGroups.some(group => group.type === prev) ? prev : (directionalGroups[0]?.type ?? 'fade'))
  }, [currentEffect, directionalGroups])

  useEffect(() => {
    setPreview('')
    setHint('')
    syncFamilyFromEffect()
  }, [activeTab])

  useEffect(() => {
    syncFamilyFromEffect()
  }, [currentEffect, syncFamilyFromEffect])

  const selectTab = (key: AnimationType) => {
    onUpdateActiveTab?.(key)
  }
  const hoverItem = (item: AnimationPreset) => {
    setPreview(item.value)
    setHint(item.name)
  }
  const clearHover = () => {
    setPreview('')
    setHint('')
  }
  const axisMark = (value: string) => {
    if (value.endsWith('X')) return 'X'
    if (value.endsWith('Y')) return 'Y'
    return ''
  }
  const tileClass = (value: string) => {
    if (!previewReady || preview !== value) return []
    return [`${ANIMATION_CLASS_PREFIX}animated`, `${ANIMATION_CLASS_PREFIX}faster`, `${ANIMATION_CLASS_PREFIX}${value}`]
  }

  return (
    <div className={cx('animation-pool')}>
      <div className={cx('pool-tabs')}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={cx('pool-tab', { active: activeTab === tab.key })}
            onMouseDown={event => { event.preventDefault() }}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'attention' ? (
        <div className={cx('fx-row cols-4')}>
          {attentionItems.map(item => (
            <button
              key={item.value}
              type="button"
              className={cx('fx-cell', { current: item.value === currentEffect })}
              onMouseDown={event => { event.preventDefault() }}
              onMouseEnter={() => hoverItem(item)}
              onMouseLeave={clearHover}
              onClick={() => onPick?.(item.value)}
            >
              <span className={cx('fx-stage')}>
                <span className={cx('fx-tile', tileClass(item.value))} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={cx('families')}>
            {directionalGroups.map(group => (
              <button
                key={group.type}
                type="button"
                className={cx('family', { active: family === group.type })}
                onMouseDown={event => { event.preventDefault() }}
                onClick={() => setFamily(group.type)}
              >
                {group.name}
              </button>
            ))}
          </div>
          {activeGroup ? (
            <div className={cx(activeGroup.kind === 'pad' ? 'fx-pad' : `fx-row cols-${activeGroup.cols}`)}>
              {activeGroup.cells.map((cell, index) => (
                !cell ? (
                  <span key={`empty-${index}`} className={cx('fx-cell empty')} />
                ) : (
                  <button
                    key={cell.value}
                    type="button"
                    className={cx('fx-cell', { current: cell.value === currentEffect })}
                    onMouseDown={event => { event.preventDefault() }}
                    onMouseEnter={() => hoverItem(cell)}
                    onMouseLeave={clearHover}
                    onClick={() => onPick?.(cell.value)}
                  >
                    <span className={cx('fx-stage')}>
                      <span className={cx('fx-tile', [tileClass(cell.value), activeGroup.kind === 'pad' ? `dir-${index}` : ''])}>
                        {axisMark(cell.value) ? <span className={cx('fx-axis')}>{axisMark(cell.value)}</span> : null}
                      </span>
                    </span>
                  </button>
                )
              ))}
            </div>
          ) : null}
        </>
      )}
      <div className={cx('pool-hint')}>{hint}</div>
    </div>
  )
})

export default AnimationPool
