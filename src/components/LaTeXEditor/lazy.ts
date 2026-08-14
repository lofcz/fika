import { createElement, useEffect, useState, type ComponentType } from 'react'
import LatexEditorSkeleton from './LatexEditorSkeleton'
import type { ILaTeXEditorProps } from './index'

type Editor = ComponentType<ILaTeXEditorProps>

let cached: Editor | null = null
let loading: Promise<Editor> | null = null

function loadLaTeXEditor() {
  if (cached) return Promise.resolve(cached)
  loading ??= import('./index').then(mod => {
    cached = mod.default
    return cached
  })
  return loading
}

export function prefetchLaTeXEditor() {
  void loadLaTeXEditor()
}

export function LazyLaTeXEditor(props: ILaTeXEditorProps) {
  const [Comp, setComp] = useState<Editor | null>(() => cached)

  useEffect(() => {
    if (cached) {
      setComp(() => cached)
      return
    }
    void loadLaTeXEditor().then(next => setComp(() => next))
  }, [])

  if (!Comp) return createElement(LatexEditorSkeleton)
  return createElement(Comp, props)
}
