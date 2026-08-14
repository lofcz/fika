import { bindStyles } from '@/utils/cssm'
import styles from './LaTeXExtractor.module.scss'
const cx = bindStyles(styles)
import { useRef, useMemo, useState, useEffect, type ElementRef } from 'react'

import { extractEquationLatex } from '@/utils/latex'
import { hfmath } from './hfmath'
import message from '@/utils/message'
import { useI18nContext } from '@/i18n/useI18nContext'

import FormulaContent from './FormulaContent'
import Button from '../Button'
import Checkbox from '../Checkbox'
import TextArea from '../TextArea'

interface LatexResult {
  latex: string
  path: string
  w: number
  h: number
}

export type ILaTeXExtractorProps = {
  onUpdate?: (payload: LatexResult[]) => void
  onClose?: () => void
}

export default function LaTeXExtractor({ onUpdate, onClose }: ILaTeXExtractorProps) {
  const { LL } = useI18nContext()
  const [source, setSource] = useState('')
  const equations = useMemo(() => extractEquationLatex(source), [source])
  const [selectedEquations, setSelectedEquations] = useState<boolean[]>([])
  const selectedCount = selectedEquations.filter(Boolean).length
  const allSelected = !!equations.length && selectedCount === equations.length
  const textAreaRef = useRef<ElementRef<typeof TextArea>>(null)
  const previousEquationsRef = useRef<string[]>([])

  useEffect(() => {
    const currentEquations = equations
    const previousEquations = previousEquationsRef.current
    setSelectedEquations(prev => currentEquations.map((latex, index) => {
      if (previousEquations?.[index] === latex) return prev[index] ?? true
      return true
    }))
    previousEquationsRef.current = currentEquations
  }, [equations])

  const toggleSelectAll = (selected: boolean) => {
    setSelectedEquations(equations.map(() => selected))
  }

  useEffect(() => {
    setTimeout(() => textAreaRef.current?.focus(), 0)
  }, [])

  const insertSelected = () => {
    if (!equations.length) return message.error(LL.components.latexExtractor.noneFound())
    if (!selectedCount) return message.error(LL.components.latexExtractor.selectAtLeastOne())

    const results: LatexResult[] = []
    for (let i = 0; i < equations.length; i++) {
      if (!selectedEquations[i]) continue

      try {
        const eq = new hfmath(equations[i])
        const path = eq.pathd({})
        const box = eq.box({})
        const w = box.w + 32
        const h = box.h + 32
        if (w <= 32 || h <= 32) {
          return message.error(LL.components.latexExtractor.renderFailed({ index: i + 1 }))
        }
        results.push({
          latex: equations[i],
          path,
          w,
          h,
        })
      }
      catch {
        return message.error(LL.components.latexExtractor.renderFailed({ index: i + 1 }))
      }
    }

    onUpdate?.(results)
  }

  return (
    <div className={cx('latex-extractor')}>
      <div className={cx('header')}>
        <div className={cx('title')}>{LL.components.latexExtractor.title()}</div>
        <div className={cx('description')}>{LL.components.latexExtractor.description()}</div>
      </div>

      <TextArea
        ref={textAreaRef}
        value={source}
        onUpdateValue={(next: string) => setSource(next)}
        className={cx('source-input')}
        placeholder={LL.components.latexExtractor.placeholder()}
      />

      <div className={cx('result-header')}>
        <span>{LL.components.latexExtractor.results()}</span>
        <div className={cx('selection-summary')}>
          <Checkbox
            value={allSelected}
            disabled={!equations.length}
            onUpdateValue={toggleSelectAll}
          >
            {LL.components.latexExtractor.selectAll()}
          </Checkbox>
          <span className={cx('count')}>
            {LL.components.latexExtractor.selectedCount({
              selected: selectedCount,
              total: equations.length,
            })}
          </span>
        </div>
      </div>
      <div className={cx('preview-list')}>
        {!equations.length ? (
          <div className={cx('empty')}>{LL.components.latexExtractor.empty()}</div>
        ) : null}
        {equations.map((latex, index) => (
          <div
            className={cx('preview-item', { selected: selectedEquations[index] })}
            key={`${index}-${latex}`}
          >
            <Checkbox
              value={selectedEquations[index]}
              onUpdateValue={(next: boolean) => {
                setSelectedEquations(prev => {
                  const copy = [...prev]
                  copy[index] = next
                  return copy
                })
              }}
            >
              <span className={cx('index')}>{index + 1}</span>
            </Checkbox>
            <FormulaContent
              className={cx('formula-preview')}
              width={660}
              height={90}
              latex={latex}
            />
          </div>
        ))}
      </div>

      <div className={cx('footer')}>
        <Button className={cx('btn')} onClick={() => onClose?.()}>{LL.common.cancel()}</Button>
        <Button className={cx('btn')} type="primary" disabled={!selectedCount} onClick={() => insertSelected()}>
          {LL.components.latexExtractor.insertSelected({ count: selectedCount })}
        </Button>
      </div>
    </div>
  )
}
