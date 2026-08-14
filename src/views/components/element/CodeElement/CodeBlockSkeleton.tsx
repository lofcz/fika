import { bindStyles } from '@/utils/cssm'
import styles from './CodeBlockSkeleton.module.scss'
const cx = bindStyles(styles)
import { memo, useMemo } from 'react'

import type { PPTCodeElement } from '@/types/slides'
import { DEFAULT_CODE_FONT_SIZE, DEFAULT_CODE_SAMPLE, isLightCodeTheme } from '@/configs/code'

type TokenTone = 'kw' | 'fn' | 'str' | 'dim'

const TONES: TokenTone[] = ['kw', 'fn', 'str', 'dim']

function lineTone(line: string, index: number): TokenTone {
  if (/^\s*(function|const|let|var|return|import|export|class|if|for|while|type|interface)\b/.test(line)) return 'kw'
  if (/[`'"]/.test(line)) return 'str'
  if (/\b[A-Za-z_]\w*\s*\(/.test(line)) return 'fn'
  return TONES[index % TONES.length]
}

function lineWidth(line: string) {
  const chars = line.replace(/\t/g, '  ').length
  if (!chars) return '0'
  return `${Math.min(92, Math.max(14, chars * 1.2))}%`
}

export type ICodeBlockSkeletonProps = {
  code?: string
  fontSize?: number
  showLineNumbers?: boolean
  theme?: string
}

const CodeBlockSkeleton = memo((props: ICodeBlockSkeletonProps) => {
  const fontSize = props.fontSize || DEFAULT_CODE_FONT_SIZE
  const showLineNumbers = props.showLineNumbers ?? true
  const light = isLightCodeTheme(props.theme || '')
  const lines = useMemo(() => (props.code || DEFAULT_CODE_SAMPLE).split('\n'), [props.code])

  return (
    <div
      className={cx('code-skeleton', { light })}
      style={{ fontSize: fontSize + 'px' }}
      aria-hidden="true"
    >
      {lines.map((line, index) => (
        <div className={cx('line')} key={index}>
          {showLineNumbers ? <span className={cx('gutter')} /> : null}
          {line.trim() ? (
            <span
              className={cx('token', lineTone(line, index))}
              style={{ width: lineWidth(line) }}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
})

export type ICodeElementPlaceholderProps = {
  elementInfo: PPTCodeElement
}

export const CodeElementPlaceholder = memo((props: ICodeElementPlaceholderProps) => {
  const { elementInfo } = props
  return (
    <div
      style={{
        position: 'absolute',
        top: elementInfo.top + 'px',
        left: elementInfo.left + 'px',
        width: elementInfo.width + 'px',
        height: elementInfo.height + 'px',
      }}
    >
      <CodeBlockSkeleton
        code={elementInfo.code}
        fontSize={elementInfo.fontSize}
        showLineNumbers={elementInfo.showLineNumbers}
        theme={elementInfo.theme}
      />
    </div>
  )
})

export default CodeBlockSkeleton
