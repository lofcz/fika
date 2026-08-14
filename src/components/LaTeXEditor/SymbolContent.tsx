import { hfmath } from './hfmath'

export type ISymbolContentProps = {
  latex: string
}

export default function SymbolContent(props: ISymbolContentProps) {
  const svg = (() => {
    const eq = new hfmath(props.latex)
    return eq.svg({
      SCALE_X: 10,
      SCALE_Y: 10,
    })
  })()

  return (
    <div className="symbol-content" dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
