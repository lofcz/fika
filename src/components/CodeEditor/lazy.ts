import { createElement, useEffect, useState, type ComponentType } from 'react'
import CodeEditorSkeleton from './CodeEditorSkeleton'
import type { ICodeEditorProps } from './index'

type Editor = ComponentType<ICodeEditorProps>

let cached: Editor | null = null
let loading: Promise<Editor> | null = null

function loadCodeEditor() {
  if (cached) return Promise.resolve(cached)
  loading ??= import('./index').then(mod => {
    cached = mod.default
    return cached
  })
  return loading
}

export function prefetchCodeEditor() {
  void loadCodeEditor()
  void import('./codeMirror')
  void import('@/utils/codeHighlight').then(mod => {
    mod.prefetchCodeRaster()
  })
}

export function LazyCodeEditor(props: ICodeEditorProps) {
  const [Comp, setComp] = useState<Editor | null>(() => cached)

  useEffect(() => {
    if (cached) {
      setComp(() => cached)
      return
    }
    void loadCodeEditor().then(next => setComp(() => next))
  }, [])

  if (!Comp) return createElement(CodeEditorSkeleton)
  return createElement(Comp, props)
}
