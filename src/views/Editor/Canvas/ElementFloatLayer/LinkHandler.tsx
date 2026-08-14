import { bindStyles } from '@/utils/cssm'
import styles from './LinkHandler.module.scss'
const cx = bindStyles(styles)
import { useCallback, memo } from 'react'

import { useMainStore, useSlidesStore } from '@/store'
import type { PPTElement } from '@/types/slides'
import useLink from '@/hooks/useLink'
import Divider from '@/components/Divider'
import { useI18nContext } from '@/i18n/useI18nContext'
import { findSlideElement, sameOffsetStyle } from './floatCompare'

export type ILinkHandlerProps = {
  elementInfo: PPTElement
  handlerStyle: Record<string, string>
  openLinkDialog: () => void
}

function linkHandlerEqual(prev: ILinkHandlerProps, next: ILinkHandlerProps) {
  return (
    prev.elementInfo.id === next.elementInfo.id &&
    prev.elementInfo.link?.type === next.elementInfo.link?.type &&
    prev.elementInfo.link?.target === next.elementInfo.link?.target &&
    sameOffsetStyle(prev.handlerStyle, next.handlerStyle) &&
    prev.openLinkDialog === next.openLinkDialog
  )
}

const LinkHandler = memo((props: ILinkHandlerProps) => {
  const { elementInfo, handlerStyle, openLinkDialog } = props
  const { LL } = useI18nContext()
  const link = elementInfo.link
  const slidePageNumber = useSlidesStore(s => {
    if (!link || link.type !== 'slide') return 0
    const index = s.slides.findIndex(item => item.id === link.target)
    return index >= 0 ? index + 1 : 0
  })
  const { removeLink } = useLink()

  const slidePageLabel = link?.type === 'slide' ? LL.canvas.link.slidePage({ number: slidePageNumber }) : ''

  const turnTarget = useCallback((slideId: string) => {
    const targetIndex = useSlidesStore.getState().slides.findIndex(item => item.id === slideId)
    if (targetIndex !== -1) {
      useMainStore.getState().setActiveElementIdList([])
      useSlidesStore.getState().updateSlideIndex(targetIndex)
    }
  }, [])

  const changeLink = useCallback(() => {
    openLinkDialog()
  }, [openLinkDialog])

  const removeCurrentLink = useCallback(() => {
    const slides = useSlidesStore.getState()
    const current = findSlideElement(slides, elementInfo.id) || elementInfo
    removeLink(current)
  }, [elementInfo, removeLink])

  return (
    <div
      className={cx('link-handler')}
      style={handlerStyle}
      onMouseDown={event => { event.stopPropagation() }}
    >
      {elementInfo.link?.type === 'web' ? (
        <a className={cx('link')} href={elementInfo.link.target} target="_blank">{elementInfo.link.target}</a>
      ) : elementInfo.link ? (
        <a className={cx('link')} onClick={() => turnTarget(elementInfo.link!.target)}>{slidePageLabel}</a>
      ) : null}
      <div className={cx('btns')}>
        <div className={cx('btn')} onClick={() => changeLink()}>{LL.canvas.link.change()}</div>
        <Divider type="vertical" />
        <div className={cx('btn')} onClick={() => removeCurrentLink()}>{LL.canvas.link.remove()}</div>
      </div>
    </div>
  )
}, linkHandlerEqual)

LinkHandler.displayName = 'LinkHandler'

export default LinkHandler
