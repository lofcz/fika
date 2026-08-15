import { bindStyles } from '@/utils/cssm'
import styles from './CodeEditorSkeleton.module.scss'
const cx = bindStyles(styles)
import { memo } from 'react'

import Button from '@/components/Button'
import { DEFAULT_CODE_FONT_SIZE, DEFAULT_CODE_LANGUAGE, DEFAULT_CODE_SAMPLE, DEFAULT_CODE_THEME, type CodeEditorPayload } from '@/configs/code'
import { useI18nContext } from '@/i18n/useI18nContext'

export type ICodeEditorSkeletonProps = {
  className?: string
  onUpdate?: (payload: CodeEditorPayload) => void
  onClose?: () => void
}

const CodeEditorSkeleton = memo((vrProps: ICodeEditorSkeletonProps) => {
  const { LL } = useI18nContext()
  const canInsert = !!vrProps.onUpdate
  const lines = [
    [
      { width: '4.4em', tone: 'kw' },
      { width: '3.2em', tone: 'fn' },
      { width: '8.5em', tone: 'dim' },
    ],
    [
      { width: '1.6em', tone: 'pad' },
      { width: '3.6em', tone: 'kw' },
      { width: '9em', tone: 'str' },
    ],
    [{ width: '0.8em', tone: 'dim' }],
    [],
    [
      { width: '5.2em', tone: 'dim' },
      { width: '2.8em', tone: 'fn' },
      { width: '5.6em', tone: 'str' },
    ],
    [
      { width: '7em', tone: 'kw' },
      { width: '4em', tone: 'fn' },
      { width: '11em', tone: 'dim' },
    ],
    [
      { width: '1.6em', tone: 'pad' },
      { width: '10em', tone: 'str' },
    ],
    [
      { width: '1.6em', tone: 'pad' },
      { width: '6em', tone: 'dim' },
      { width: '4em', tone: 'fn' },
    ],
    [],
    [
      { width: '3.2em', tone: 'kw' },
      { width: '8em', tone: 'dim' },
    ],
  ]

  return (
    <div className={cx('code-editor-skeleton', vrProps.className)} aria-hidden={canInsert ? undefined : 'true'}>
      <div className={cx('toolbar')}>
        {[1, 2].map(n => (
          <div className={cx('field')} key={n}>
            <span className={cx('label')} />
            <span className={cx('control')} />
          </div>
        ))}
        <div className={cx('field', 'size-field')}>
          <span className={cx('label')} />
          <span className={cx('size-control')}>
            <span className={cx('step')} />
            <span className={cx('select')} />
            <span className={cx('step')} />
          </span>
        </div>
        <div className={cx('toggle')}>
          <span className={cx('switch')} />
          <span className={cx('switch-label')} />
        </div>
      </div>

      <div className={cx('editor')}>
        {lines.map((line, index) => (
          <div className={cx('line')} key={index}>
            <span className={cx('gutter')} />
            {line.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                className={cx('token', token.tone)}
                style={{ width: token.width }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className={cx('footer')}>
        {canInsert ? (
          <>
            <Button className={cx('btn')} onClick={() => vrProps.onClose?.()}>{LL.common.cancel()}</Button>
            <Button
              className={cx('btn')}
              type="primary"
              data-editor-insert="code"
              onClick={() => vrProps.onUpdate?.({
                code: DEFAULT_CODE_SAMPLE,
                language: DEFAULT_CODE_LANGUAGE,
                theme: DEFAULT_CODE_THEME,
                fontSize: DEFAULT_CODE_FONT_SIZE,
                showLineNumbers: true,
              })}
            >{LL.common.ok()}</Button>
          </>
        ) : (
          <>
            <span className={cx('btn')} />
            <span className={cx('btn', 'primary')} />
          </>
        )}
      </div>
    </div>
  )
})

export default CodeEditorSkeleton
