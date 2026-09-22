import type { Slide } from '@/types/slides'
import { useSlidesStore } from '@/store'

type Source = { slides: Slide[] }
export type WorkspacePage = Pick<Slide, 'id' | 'canvasName' | 'canvasPosition' | 'guides'>
export type WorkspaceAnnotations = Pick<Slide, 'id' | 'workspaceLabels'>
/** Stable projections: changing artwork must not invalidate workspace layout or annotations. */
function projection<T>(project: (slide: Slide) => T, equal: (a: T, b: T) => boolean) {
  let source: Slide[] | undefined, output: T[] = [], byId = new Map<string, T>()
  return (state: Source): T[] => {
    if (source === state.slides) return output
    const nextById = new Map<string, T>()
    const next = state.slides.map(slide => {
      const value = project(slide), old = byId.get(slide.id)
      const result = old && equal(old, value) ? old : value
      nextById.set(slide.id, result); return result
    })
    source = state.slides; byId = nextById
    if (next.length !== output.length || next.some((value, i) => value !== output[i])) output = next
    return output
  }
}
export const selectWorkspacePages = projection<WorkspacePage>(s => ({ id:s.id, canvasName:s.canvasName, canvasPosition:s.canvasPosition, guides:s.guides }), (a,b) => a.id===b.id && a.canvasName===b.canvasName && a.canvasPosition===b.canvasPosition && a.guides===b.guides)
export const selectWorkspacePageNames = projection<Pick<Slide,'id'|'canvasName'>>(s=>({id:s.id,canvasName:s.canvasName}), (a,b)=>a.id===b.id&&a.canvasName===b.canvasName)
export const selectWorkspaceAnnotations = projection<WorkspaceAnnotations>(s=>({id:s.id,workspaceLabels:s.workspaceLabels}), (a,b)=>a.id===b.id&&a.workspaceLabels===b.workspaceLabels)
export const useWorkspacePages = () => useSlidesStore(selectWorkspacePages)
export const useWorkspaceAnnotations = () => useSlidesStore(selectWorkspaceAnnotations)

const textSummaries = new WeakMap<Slide['elements'], string>()
export const selectWorkspacePageSummaries = projection<{ id: string; canvasName?: string; summary: string }>(slide => {
  let summary = textSummaries.get(slide.elements)
  if (summary === undefined) {
    summary = slide.elements.filter(el => el.type === 'text').map(el => el.type === 'text' ? el.content.replace(/<[^>]*>/g, ' ') : '').join(' ').trim()
    textSummaries.set(slide.elements, summary)
  }
  return { id: slide.id, canvasName: slide.canvasName, summary }
}, (a,b) => a.id === b.id && a.canvasName === b.canvasName && a.summary === b.summary)
