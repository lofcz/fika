import { bindStyles } from '@/utils/cssm'
import styles from './FormulaContent.module.scss'
const cx = bindStyles(styles)
import { useState, useEffect } from 'react'

import { hfmath } from './hfmath'

export type IFormulaContentProps = {
  latex: string
  width: number
  height: number
  className?: string
}

export default function FormulaContent(props: IFormulaContentProps) {
  const [box, setBox] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [pathd, setPathd] = useState('')

  useEffect(() => {
    const eq = new hfmath(props.latex)
    setPathd(eq.pathd({}))
    setBox(eq.box({}))
  }, [props.latex])

  const scale = (() => {
    const boxW = box.w + 32
    const boxH = box.h + 32
    if (boxW > props.width || boxH > props.height) {
      if (boxW / boxH > props.width / props.height) return props.width / boxW
      return props.height / boxH
    }
    return 1
  })()

  return (
    <svg
      className={cx('formula-content', props.className)}
      overflow="visible"
      width={box.w + 32}
      height={box.h + 32}
      stroke="#000"
      strokeWidth="1"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g
        transform={`scale(${scale}, ${scale}) translate(0,0) matrix(1,0,0,1,0,0)`}
        style={{ transformOrigin: '0 50%' }}
      >
        <path d={pathd} />
      </g>
    </svg>
  )
}
