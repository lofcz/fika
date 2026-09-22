import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useI18nContext } from '@/i18n/useI18nContext'
import { useMainStore } from '@/store'
import { ToolbarStates } from '@/types/toolbar'
import { useHandleElementType, useHasActiveGroupElement } from '@/views/Editor/Toolbar/common/handleElement'
import ElementStylePanel from '@/views/Editor/Toolbar/ElementStylePanel'
import ElementPositionPanel from '@/views/Editor/Toolbar/ElementPositionPanel'
import ElementAnimationPanel from '@/views/Editor/Toolbar/ElementAnimationPanel'
import SlideDesignPanel from '@/views/Editor/Toolbar/SlideDesignPanel'
import SlideAnimationPanel from '@/views/Editor/Toolbar/SlideAnimationPanel'
import MultiStylePanel from '@/views/Editor/Toolbar/MultiStylePanel'
import MultiPositionPanel from '@/views/Editor/Toolbar/MultiPositionPanel'
import { inspectorLabels } from './inspectorLabels'
import styles from './inspector.module.scss'

function Section({ title, children, initialOpen = false, requested, disabled }: {
  title: string; children: ReactNode; initialOpen?: boolean; requested: boolean; disabled: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  // Native context-menu commands still reveal the appropriate inspector section.
  useEffect(() => { if (requested) setOpen(true) }, [requested])
  return <details className={styles.section} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>{title}</span><ChevronDown size={15} aria-hidden="true" /></summary>
    <fieldset className={styles.fields} disabled={disabled} inert={disabled}>
      {open && children}
    </fieldset>
  </details>
}

/** Context-sensitive surface over the native editing engine and its history. */
export default function MynaInspector() {
  const { locale } = useI18nContext()
  const t = inspectorLabels(locale)
  const count = useMainStore(s => s.activeElementIdList.length)
  const toolbarState = useMainStore(s => s.toolbarState)
  const readOnly = useMainStore(s => s.readOnly)
  const groupChild = useHasActiveGroupElement()
  const type = useHandleElementType()
  const multi = count > 1 && !groupChild
  const kind = !count ? 'page' : multi ? 'multi' : type ?? 'selection'
  const title = !count ? t.page : multi ? `${t.selected} · ${count}` : type === 'image' ? t.photo : t[type as keyof typeof t] ?? t.selection
  const appearance = type === 'text' ? t.typography : type === 'image' ? t.image : t.appearance
  const section = (key: string, label: string, state: ToolbarStates, children: ReactNode, initialOpen = false) =>
    <Section key={`${kind}:${key}`} title={label} initialOpen={initialOpen} requested={toolbarState === state} disabled={readOnly}>{children}</Section>
  return <div className={styles.inspector} data-myna-inspector data-selection-kind={kind}>
    <header className={styles.context}><strong>{title}</strong>
      {(!count || multi || readOnly) && <p>{readOnly ? t.readOnly : multi ? t.multiHint : t.pageHint}</p>}
    </header>
    {!count ? <>
      {section('design', t.design, ToolbarStates.SLIDE_DESIGN, <SlideDesignPanel />, true)}
      {section('transition', t.transition, ToolbarStates.SLIDE_ANIMATION, <SlideAnimationPanel />)}
      {section('motion', t.motion, ToolbarStates.EL_ANIMATION, <ElementAnimationPanel />)}
    </> : multi ? <>
      {section('appearance', t.appearance, ToolbarStates.MULTI_STYLE, <MultiStylePanel />, true)}
      {section('arrange', t.arrange, ToolbarStates.MULTI_POSITION, <MultiPositionPanel />, true)}
    </> : <>
      {section('appearance', appearance, ToolbarStates.EL_STYLE, <ElementStylePanel />, true)}
      {section('geometry', t.geometry, ToolbarStates.EL_POSITION, <ElementPositionPanel />, true)}
      {section('motion', t.motion, ToolbarStates.EL_ANIMATION, <ElementAnimationPanel />)}
    </>}
  </div>
}
