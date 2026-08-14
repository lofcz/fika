import { bindStyles } from '@/utils/cssm'
import { Icon } from '@/components/Icon'
import styles from './index.module.scss'
const cx = bindStyles(styles)
import { memo, useCallback, useMemo } from 'react'
import { saveAs } from 'file-saver'

import { useMainStore, useSlidesStore } from '@/store'
import { isExportTabEnabled } from '@/configs/exportTabs'
import { useI18nContext } from '@/i18n/useI18nContext'
import useExport from '@/hooks/useExport'
import Button from '@/components/Button'
import JobProgressOverlay from '@/components/JobProgressOverlay'

const ExportDialog = memo((props: { className?: string }) => {
  const { LL } = useI18nContext()
  const slides = useSlidesStore(s => s.slides)
  const { exportPPTX, exporting, exportProgress, exportSlide, exportSlideTotal } = useExport()

  const pptxEnabled = isExportTabEnabled('pptx')
  const jsonEnabled = isExportTabEnabled('json')
  const formats = [
    ...(pptxEnabled ? ['pptx'] : []),
    ...(jsonEnabled ? ['json'] : []),
  ]

  const slideCountLabel = LL.export.dialog.slideCount({ count: slides.length })
  const progressLabels = useMemo(() => ({
    running: LL.export.dialog.exporting(),
    preparing: LL.export.dialog.preparing(),
    finishing: LL.export.dialog.writing(),
    slideProgress: LL.export.dialog.slideProgress,
  }), [LL])

  const downloadPptx = useCallback(() => {
    if (exporting) return
    exportPPTX(useSlidesStore.getState().slides, true)
  }, [exporting, exportPPTX])

  const downloadJson = useCallback(() => {
    if (exporting) return
    const { title, viewportSize, viewportRatio, theme, slides: deck } = useSlidesStore.getState()
    const json = {
      title,
      width: viewportSize,
      height: viewportSize * viewportRatio,
      theme,
      slides: deck,
    }
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json;charset=utf-8' })
    saveAs(blob, `${title}.json`)
    useMainStore.getState().setDialogForExport('')
  }, [exporting])

  return (
    <div className={cx('export-dialog', props.className)}>
      <div className={cx('intro')}>
        <div className={cx('title')}>{LL.export.dialog.title()}</div>
        <div className={cx('subtitle')}>{LL.export.dialog.subtitle()}</div>
      </div>

      <div className={cx('formats', formats.length === 1 && 'is-single')}>
        {pptxEnabled ? (
          <article
            className={cx('format-card', 'export-pptx-dialog', exporting && 'busy')}
            onClick={() => downloadPptx()}
          >
            <div className={cx('glyph')} aria-hidden="true">PPTX</div>
            <div className={cx('body')}>
              <div className={cx('name')}>{LL.export.pptx.title()}</div>
              <div className={cx('desc')}>{LL.export.pptx.description()}</div>
              <div className={cx('meta')}>{slideCountLabel}</div>
            </div>
            <div className={cx('btns')} onClick={event => event.stopPropagation()}>
              <Button
                className={cx('btn', 'export')}
                type="primary"
                data-export-format="pptx"
                disabled={exporting}
                onClick={downloadPptx}
              >
                <Icon icon="download" /> {LL.export.pptx.exportButton()}
              </Button>
            </div>
          </article>
        ) : null}

        {jsonEnabled ? (
          <article
            className={cx('format-card', exporting && 'busy')}
            onClick={() => downloadJson()}
          >
            <div className={cx('glyph', 'glyph-json')} aria-hidden="true">{'{ }'}</div>
            <div className={cx('body')}>
              <div className={cx('name')}>{LL.export.json.title()}</div>
              <div className={cx('desc')}>{LL.export.json.description()}</div>
              <div className={cx('meta')}>{slideCountLabel}</div>
            </div>
            <div className={cx('btns')} onClick={event => event.stopPropagation()}>
              <Button
                className={cx('btn', 'export')}
                type="primary"
                data-export-format="json"
                disabled={exporting}
                onClick={downloadJson}
              >
                <Icon icon="download" /> {LL.export.json.exportButton()}
              </Button>
            </div>
          </article>
        ) : null}
      </div>

      <JobProgressOverlay
        loading={exporting}
        progress={exportProgress}
        current={exportSlide}
        total={exportSlideTotal}
        labels={progressLabels}
      />
    </div>
  )
})

export default ExportDialog
