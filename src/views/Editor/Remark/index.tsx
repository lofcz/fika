import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, type CSSProperties } from 'react'

import { useSlidesStore } from '@/store'
import { useI18nContext } from '@/i18n/useI18nContext'
import Editor from './Editor'

export type IRemarkProps = {
  height: number
  codePanelOpen?: boolean
  className?: string
  style?: CSSProperties
  onUpdateHeight?: (payload: number) => void
  onToggleCodePanel?: () => void
}

function remarkPropsEqual(prev: IRemarkProps, next: IRemarkProps) {
  return prev.height === next.height
    && prev.codePanelOpen === next.codePanelOpen
    && prev.className === next.className
    && prev.onUpdateHeight === next.onUpdateHeight
    && prev.onToggleCodePanel === next.onToggleCodePanel
    && prev.style?.height === next.style?.height
}

const Remark = memo((props: IRemarkProps) => {
  const { LL } = useI18nContext()
  const remark = useSlidesStore(s => s.slides[s.slideIndex]?.remark || '')
  const codePanelOpen = !!props.codePanelOpen

  const handleInput = useCallback((content: string) => {
    useSlidesStore.getState().updateSlide({ remark: content })
  }, [])

  const resize = useCallback((e: React.MouseEvent) => {
    let isMouseDown = true
    const startPageY = e.pageY
    const originHeight = props.height

    document.onmousemove = ev => {
      if (!isMouseDown) return

      const currentPageY = ev.pageY
      const moveY = currentPageY - startPageY
      let newHeight = -moveY + originHeight

      if (newHeight < 40) newHeight = 40
      if (newHeight > 360) newHeight = 360

      props.onUpdateHeight?.(newHeight)
    }

    document.onmouseup = () => {
      isMouseDown = false
      document.onmousemove = null
      document.onmouseup = null
    }
  }, [props.height, props.onUpdateHeight])

  return (
    <div className={cx('remark', props.className)} style={props.style}>
      <div
        className={cx('resize-handler')}
        onMouseDown={event => resize(event)}
      />
      <div className={cx('remark-body')}>
        <div className={cx('remark-editor')}>
          <Editor
            value={remark}
            onUpdate={handleInput}
          />
        </div>
        <div className={cx('remark-actions')}>
          <button
            className={cx('code-panel-btn', { active: codePanelOpen })}
            type="button"
            title={codePanelOpen
              ? LL.editor.slideCodePanel.closeTooltip()
              : LL.editor.slideCodePanel.openTooltip()}
            aria-label={codePanelOpen
              ? LL.editor.slideCodePanel.closeTooltip()
              : LL.editor.slideCodePanel.openTooltip()}
            aria-pressed={codePanelOpen}
            onClick={() => props.onToggleCodePanel?.()}
          >
            <Icon icon="code" />
          </button>
        </div>
      </div>
    </div>
  )
}, remarkPropsEqual)

Remark.displayName = 'Remark'

export default Remark
