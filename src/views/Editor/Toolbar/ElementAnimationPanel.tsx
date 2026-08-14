import { bindStyles } from '@/utils/cssm'
import styles from './ElementAnimationPanel.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { nanoid } from 'nanoid'
import { useSlidesStore, selectCurrentSlide, selectCurrentSlideAnimations, selectFormatedAnimations } from '@/store'
import { useHandleElementId, useHasHandleElement, useToolbarStoreSelect } from './common/handleElement'
import type { AnimationTrigger, AnimationType, PPTAnimation, PPTElement } from '@/types/slides'
import {
  ENTER_ANIMATIONS,
  EXIT_ANIMATIONS,
  ATTENTION_ANIMATIONS,
  ANIMATION_DEFAULT_DURATION,
  ANIMATION_DEFAULT_TRIGGER,
  ANIMATION_CLASS_PREFIX,
  type AnimationPresetGroup,
} from '@/configs/animation'
import useHistorySnapshot from '@/hooks/useHistorySnapshot'
import useSelectElement from '@/hooks/useSelectElement'
import { queryFika } from '@/utils/portal'
import { useI18nContext } from '@/i18n/useI18nContext'
import { Icon } from '@/components/Icon'
import Divider from '@/components/Divider'
import Button from '@/components/Button'
import NumberInput from '@/components/NumberInput'
import Select from '@/components/Select'
import Popover from '@/components/Popover'
import FitText from '@/components/FitText'
import Draggable from '@/components/Draggable'
import AnimationPool from './common/AnimationPool'

const resolveAnimationGroups = (
  groups: readonly { type: string; children: readonly { value: string }[] }[],
  labels: { groups: { [key: string]: () => string }; effects: { [key: string]: () => string } },
): AnimationPresetGroup[] => groups.map(group => ({
  type: group.type,
  name: labels.groups[group.type](),
  children: group.children.map(child => ({
    value: child.value,
    name: labels.effects[child.value](),
  })),
}))

const ElementAnimationPanel = memo(function ElementAnimationPanel() {
  const { LL } = useI18nContext()
  const handleElementId = useHandleElementId()
  const handleElement = useHasHandleElement()
  const animationView = useToolbarStoreSelect(() => {
    const state = useSlidesStore.getState()
    const slide = selectCurrentSlide(state)
    const formatedAnimations = selectFormatedAnimations(state)
    const types: Record<string, PPTElement['type']> = {}
    for (const el of slide?.elements || []) types[el.id] = el.type
    return formatedAnimations.flatMap((item, i) => item.animations.map((animation, j) => ({
      ...animation,
      index: j === 0 ? i + 1 : '' as number | '',
      elType: types[animation.elId],
    })))
  }, (a, b) => (
    a.length === b.length && a.every((item, i) => (
      item.id === b[i].id
      && item.elId === b[i].elId
      && item.type === b[i].type
      && item.effect === b[i].effect
      && item.duration === b[i].duration
      && item.trigger === b[i].trigger
      && item.index === b[i].index
      && item.elType === b[i].elType
    ))
  ))
  const sequenceSource = animationView
  const { addHistorySnapshot } = useHistorySnapshot()
  const { selectElement } = useSelectElement()

  const [activeTab, setActiveTab] = useState<AnimationType>('in')
  const [animateIn, setAnimateIn] = useState(false)
  const animateInRef = useRef(false)
  const [animationPoolVisible, setAnimationPoolVisible] = useState(false)
  const [handleAnimationId, setHandleAnimationId] = useState('')
  const [popoverMaskHide, setPopoverMaskHide] = useState(false)

  const elementTypeLabels: Record<PPTElement['type'], () => string> = {
    text: () => LL.editor.elementTypes.text(),
    image: () => LL.editor.elementTypes.image(),
    shape: () => LL.editor.elementTypes.shape(),
    line: () => LL.editor.elementTypes.line(),
    chart: () => LL.editor.elementTypes.chart(),
    table: () => LL.editor.elementTypes.table(),
    video: () => LL.editor.elementTypes.video(),
    audio: () => LL.editor.elementTypes.audio(),
    latex: () => LL.editor.elementTypes.latex(),
    mermaid: () => LL.editor.elementTypes.mermaid(),
    code: () => LL.editor.elementTypes.code(),
  }

  const tabs = useMemo(() => [
    { key: 'in' as const, label: LL.editor.elementAnimation.tabIn() },
    { key: 'out' as const, label: LL.editor.elementAnimation.tabOut() },
    { key: 'attention' as const, label: LL.editor.elementAnimation.tabAttention() },
  ], [LL])

  const animationTriggerOptions = useMemo(() => [
    { label: LL.editor.elementAnimation.triggerClick(), value: 'click' },
    { label: LL.editor.elementAnimation.triggerMeantime(), value: 'meantime' },
    { label: LL.editor.elementAnimation.triggerAuto(), value: 'auto' },
  ], [LL])

  const animations = useMemo(() => {
    const animation = LL.configs.animation
    return {
      in: resolveAnimationGroups(ENTER_ANIMATIONS, animation.enter),
      out: resolveAnimationGroups(EXIT_ANIMATIONS, animation.exit),
      attention: resolveAnimationGroups(ATTENTION_ANIMATIONS, animation.attention),
    }
  }, [LL])

  const animationEffects = useMemo(() => {
    const map: Record<string, string> = {}
    for (const groups of Object.values(animations)) {
      for (const effect of groups) {
        for (const animation of effect.children) {
          map[animation.value] = animation.name
        }
      }
    }
    return map
  }, [animations])

  useEffect(() => {
    setAnimationPoolVisible(false)
  }, [handleElementId])

  const animationSequence: Array<PPTAnimation & { index: number | ''; elType: string; animationEffect: string }> = []
  for (const item of sequenceSource) {
    if (!item.elType) continue
    animationSequence.push({
      ...item,
      elType: elementTypeLabels[item.elType](),
      animationEffect: animationEffects[item.effect],
    })
  }

  const handleElementAnimation = sequenceSource.filter(item => item.elId === handleElementId)
  const poolCurrentEffect = handleAnimationId
    ? sequenceSource.find(item => item.id === handleAnimationId)?.effect ?? ''
    : ''

  const commit = (next: PPTAnimation[]) => {
    useSlidesStore.getState().updateSlide({ animations: next })
    addHistorySnapshot()
  }

  const animationsNow = () => selectCurrentSlideAnimations(useSlidesStore.getState())

  const deleteAnimation = (id: string) => {
    commit(animationsNow().filter(item => item.id !== id))
  }

  const handleDragEnd = ({ newIndex, oldIndex }: { newIndex: number; oldIndex: number }) => {
    if (newIndex === undefined || oldIndex === undefined || newIndex === oldIndex) return
    const next: PPTAnimation[] = JSON.parse(JSON.stringify(animationsNow()))
    const animation = next[oldIndex]
    next.splice(oldIndex, 1)
    next.splice(newIndex, 0, animation)
    commit(next)
  }

  const runAnimation = (elId: string, effect: string, duration: number) => {
    const elRef = queryFika<HTMLElement>(`#editable-element-${elId} [class^=editable-element-]`)
    if (!elRef) return
    const animationName = `${ANIMATION_CLASS_PREFIX}${effect}`
    elRef.style.setProperty('--animate-duration', `${duration}ms`)
    elRef.classList.add(`${ANIMATION_CLASS_PREFIX}animated`, animationName)
    const handleAnimationEnd = () => {
      elRef.style.removeProperty('--animate-duration')
      elRef.classList.remove(`${ANIMATION_CLASS_PREFIX}animated`, animationName)
    }
    elRef.addEventListener('animationend', handleAnimationEnd, { once: true })
  }

  const runAllAnimation = async () => {
    const next = !animateInRef.current
    animateInRef.current = next
    setAnimateIn(next)
    for (let i = 0; i < animationSequence.length; i++) {
      if (!animateInRef.current) break
      const item = animationSequence[i]
      if (item.index !== 1 && item.trigger !== 'meantime') await new Promise(resolve => setTimeout(resolve, item.duration + 100))
      runAnimation(item.elId, item.effect, item.duration)
      if (i >= animationSequence.length - 1) {
        animateInRef.current = false
        setAnimateIn(false)
      }
    }
  }

  const updateElementAnimationDuration = (id: string, duration: number) => {
    if (duration < 100 || duration > 5000) return
    commit(animationsNow().map(item => item.id === id ? { ...item, duration } : item))
  }

  const updateElementAnimationTrigger = (id: string, trigger: AnimationTrigger) => {
    commit(animationsNow().map(item => item.id === id ? { ...item, trigger } : item))
  }

  const updateElementAnimation = (type: AnimationType, effect: string) => {
    const latest = animationsNow()
    commit(latest.map(item => item.id === handleAnimationId ? { ...item, type, effect } : item))
    setAnimationPoolVisible(false)
    const animationItem = latest.find(item => item.elId === handleElementId)
    const duration = animationItem?.duration || ANIMATION_DEFAULT_DURATION
    setTimeout(() => runAnimation(handleElementId, effect, duration), 0)
  }

  const addAnimation = (type: AnimationType, effect: string) => {
    if (handleAnimationId) {
      updateElementAnimation(type, effect)
      return
    }
    const next: PPTAnimation[] = JSON.parse(JSON.stringify(animationsNow()))
    next.push({
      id: nanoid(10),
      elId: handleElementId,
      type,
      effect,
      duration: ANIMATION_DEFAULT_DURATION,
      trigger: ANIMATION_DEFAULT_TRIGGER,
    })
    commit(next)
    setAnimationPoolVisible(false)
    setTimeout(() => runAnimation(handleElementId, effect, ANIMATION_DEFAULT_DURATION), 0)
  }

  const handlePopoverVisibleChange = (visible: boolean) => {
    setAnimationPoolVisible(visible)
    if (visible) setTimeout(() => setPopoverMaskHide(true), 200)
    else setPopoverMaskHide(false)
  }

  const openAnimationPool = (elementId: string) => {
    const existing = animationsNow().find(item => item.id === elementId)
    if (existing) setActiveTab(existing.type)
    setHandleAnimationId(elementId)
    handlePopoverVisibleChange(true)
  }

  return (
    <div className={cx('element-animation-panel')}>
      {handleElement ? (
        <div className={cx('element-animation')}>
          <Popover
            trigger="click"
            placement="left-start"
            value={animationPoolVisible}
            onUpdateValue={visible => handlePopoverVisibleChange(visible)}
            contentStyle={{ padding: '10px' }}
            style={{ width: '100%' }}
            content={(
              <AnimationPool
                activeTab={activeTab}
                tabs={tabs}
                groups={animations[activeTab]}
                previewReady={popoverMaskHide}
                currentEffect={poolCurrentEffect}
                onUpdateActiveTab={setActiveTab}
                onPick={effect => addAnimation(activeTab, effect)}
              />
            )}
          >
            <Button className={cx('element-animation-btn')} onClick={() => setHandleAnimationId('')}>
              <Icon icon="sparkles" />
              <FitText text={LL.editor.elementAnimation.addAnimation()} maxFontSize={13} minFontSize={10} letterSpacing={1} />
            </Button>
          </Popover>
        </div>
      ) : (
        <div className={cx('empty-hint')}>
          <div className={cx('empty-mark')} aria-hidden>
            <Icon icon="sparkles" />
          </div>
          <p className={cx('empty-title')}>{LL.editor.elementAnimation.selectElementTitle()}</p>
          <p className={cx('empty-body')}>{LL.editor.elementAnimation.selectElementTip()}</p>
        </div>
      )}

      {handleElement || animationSequence.length ? <Divider /> : null}

      <Draggable
        className={cx('animation-sequence')}
        modelValue={animationSequence}
        animation={200}
        scroll
        scrollSensitivity={50}
        itemKey="id"
        handle=".sequence-content"
        onEnd={handleDragEnd}
        item={({ element }) => (
          <div
            className={cx('sequence-item', element.type, { active: handleElementId === element.elId })}
            onClick={() => selectElement(element.elId)}
          >
            <div className={cx('sequence-content')}>
              <div className={cx('index')}>{element.index}</div>
              <div className={cx('text')}>{LL.editor.elementAnimation.sequenceLabel({ elementType: element.elType, effect: element.animationEffect })}</div>
              <div className={cx('handler')}>
                <Icon icon="play" className={cx('handler-btn')} data-tooltip={LL.editor.elementAnimation.preview()} onClick={event => { event.stopPropagation(); runAnimation(element.elId, element.effect, element.duration) }} />
                <Icon icon="x" className={cx('handler-btn')} data-tooltip={LL.common.delete()} onClick={event => { event.stopPropagation(); deleteAnimation(element.id) }} />
              </div>
            </div>
            {handleElementAnimation[0]?.elId === element.elId ? (
              <div className={cx('configs')}>
                <Divider margin={16} />
                <div className={cx('config-item')}>
                  <div style={{ width: '35%' }}>{LL.editor.elementAnimation.duration()}</div>
                  <NumberInput min={500} max={3000} step={500} value={element.duration} onUpdateValue={value => updateElementAnimationDuration(element.id, value)} style={{ width: '65%' }} />
                </div>
                <div className={cx('config-item')}>
                  <div style={{ width: '35%' }}>{LL.editor.elementAnimation.trigger()}</div>
                  <Select
                    value={element.trigger}
                    onUpdateValue={value => updateElementAnimationTrigger(element.id, value as AnimationTrigger)}
                    style={{ width: '65%' }}
                    options={animationTriggerOptions}
                  />
                </div>
                <div className={cx('config-item')}>
                  <Button style={{ width: '100%' }} onClick={() => openAnimationPool(element.id)}>
                    <Icon icon="arrow-left-right" /> {LL.editor.elementAnimation.changeAnimation()}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      />

      {animationSequence.length >= 2 ? (
        <>
          <Divider />
          <Button onClick={() => runAllAnimation()}>
            {animateIn ? <Icon icon="pause" /> : <Icon icon="play" />}
            {' '}
            {animateIn ? LL.editor.elementAnimation.stopPreview() : LL.editor.elementAnimation.previewAll()}
          </Button>
        </>
      ) : null}
    </div>
  )
})

export default ElementAnimationPanel
