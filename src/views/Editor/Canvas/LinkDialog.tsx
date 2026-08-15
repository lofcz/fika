import { bindStyles } from '@/utils/cssm'
import styles from './LinkDialog.module.scss'
const cx = bindStyles(styles)
import { useRef, useCallback, memo, useState, useEffect } from 'react'

import { useMainStore, useSlidesStore, selectHandleElement, selectCurrentSlide } from '@/store'
import type { ElementLinkType, PPTElementLink } from '@/types/slides'
import useLink from '@/hooks/useLink'
import ThumbnailSlide from '@/views/components/ThumbnailSlide/index'
import Tabs from '@/components/Tabs'
import Input from '@/components/Input'
import Button from '@/components/Button'
import Select from '@/components/Select'
import { useI18nContext } from '@/i18n/useI18nContext'

export type ILinkDialogProps = {
  onClose?: () => void
}

const LinkDialog = memo((props: ILinkDialogProps) => {
  const { LL } = useI18nContext()
  const handleElement = useMainStore(selectHandleElement)
  const slides = useSlidesStore(s => s.slides)
  const currentSlide = useSlidesStore(selectCurrentSlide)
  const [type, setType] = useState<ElementLinkType>('web')
  const [address, setAddress] = useState('')
  const [slideId, setSlideId] = useState(() => (
    useSlidesStore.getState().slides.find(item => item.id !== selectCurrentSlide(useSlidesStore.getState())?.id)?.id || ''
  ))
  const inputRef = useRef<{ focus: () => void } | null>(null)
  const onCloseRef = useRef(props.onClose)
  onCloseRef.current = props.onClose

  const slideOptions = slides.map((item, index) => ({
    label: LL.canvas.link.slideOption({ number: index + 1 }),
    value: item.id,
    disabled: currentSlide.id === item.id,
  }))

  const selectedSlide = slideId ? slides.find(item => item.id === slideId) || null : null
  const tabs = [
    { key: 'web', label: LL.canvas.link.webLink() },
    { key: 'slide', label: LL.canvas.link.slideLink(), disabled: slides.length <= 1 },
  ]
  const { setLink } = useLink()

  useEffect(() => {
    const main = useMainStore.getState()
    main.setDisableHotkeysState(true)
    const el = selectHandleElement(main)
    let nextType: ElementLinkType = 'web'
    if (el?.link) {
      if (el.link.type === 'web') setAddress(el.link.target)
      else if (el.link.type === 'slide') setSlideId(el.link.target)
      nextType = el.link.type
      setType(nextType)
    }
    if (nextType === 'web') {
      Promise.resolve().then(() => {
        inputRef.current?.focus()
      })
    }
    return () => {
      useMainStore.getState().setDisableHotkeysState(false)
    }
  }, [])

  const save = useCallback(() => {
    const link: PPTElementLink = {
      type,
      target: type === 'web' ? address : slideId,
    }
    const target = selectHandleElement(useMainStore.getState()) ?? handleElement
    if (target) {
      const success = setLink(target, link)
      if (success) onCloseRef.current?.()
      else setAddress('')
    }
  }, [type, address, slideId, handleElement, setLink])

  return (
    <div className={cx('link-dialog')}>
      <Tabs tabs={tabs} value={type} onUpdateValue={(value: ElementLinkType) => setType(value)} tabsStyle={{ marginBottom: '20px' }} />
      {type === 'web' ? (
        <Input
          className={cx('input')}
          ref={inputRef}
          value={address}
          onUpdateValue={(value: string) => setAddress(value)}
          placeholder={LL.canvas.link.urlPlaceholder()}
          onEnter={save}
        />
      ) : null}
      {type === 'slide' ? (
        <Select className={cx('input')} value={slideId} onUpdateValue={(value: string) => setSlideId(value)} options={slideOptions} />
      ) : null}
      {type === 'slide' && selectedSlide ? (
        <div className={cx('preview')}>
          <div>{LL.canvas.link.preview()}</div>
          <ThumbnailSlide className={cx('thumbnail')} slide={{ id: selectedSlide.id }} size={500} />
        </div>
      ) : null}
      <div className={cx('btns')}>
        <Button onClick={() => onCloseRef.current?.()} style={{ marginRight: '10px' }}>{LL.common.cancel()}</Button>
        <Button type="primary" onClick={save}>{LL.common.confirm()}</Button>
      </div>
    </div>
  )
})

export default LinkDialog
