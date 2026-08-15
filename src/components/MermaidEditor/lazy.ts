import { createElement, useEffect, useState, type ComponentType } from 'react'
import { prefetchMermaid } from '@/utils/mermaid'
import MermaidEditorSkeleton from './MermaidEditorSkeleton'
import type { IMermaidEditorProps } from './index'

type Editor = ComponentType<IMermaidEditorProps>

let cached: Editor | null = null
let loading: Promise<Editor> | null = null

function loadMermaidEditor() {
  prefetchMermaid()
  if (cached) return Promise.resolve(cached)
  loading ??= import('./index').then(mod => {
    cached = mod.default
    return cached
  })
  return loading
}

export function prefetchMermaidEditor() {
  void loadMermaidEditor()
}

export function LazyMermaidEditor(props: IMermaidEditorProps) {
  const [Comp, setComp] = useState<Editor | null>(() => cached)

  useEffect(() => {
    if (cached) {
      setComp(() => cached)
      return
    }
    void loadMermaidEditor().then(next => setComp(() => next))
  }, [])

  if (!Comp) return createElement(MermaidEditorSkeleton)
  return createElement(Comp, props)
}
