import { instantiateTemplateSlides } from '@/utils/instantiateTemplateSlides'
import type { Slide, SlideTheme } from '@/types/slides'
import { resizeDeckSlides } from '@/utils/resizeDeck'
import { persistableMediaSrc, getInternedBlob } from '@/utils/mediaIntern'

export const TEMPLATE_LIBRARY_KEY = 'fika:myna:personal-templates:v1'
export const TEMPLATE_LIBRARY_LIMIT = 4 * 1024 * 1024
export interface PersonalTemplate {
  id: string; name: string; width: number; height: number; slides: Slide[]; theme: SlideTheme
  createdAt: number; updatedAt: number; lastUsedAt: number; favorite: boolean
}
export interface LibraryStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function readTemplateLibrary(storage: LibraryStorage): PersonalTemplate[] {
  const raw = storage.getItem(TEMPLATE_LIBRARY_KEY)
  if (!raw) return []
  const parsed = JSON.parse(raw)
  if (parsed.version !== 1 || !Array.isArray(parsed.templates) || parsed.templates.some((item: PersonalTemplate) =>
    !item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Number.isFinite(item.width) || item.width <= 0 ||
    !Number.isFinite(item.height) || item.height <= 0 || !Array.isArray(item.slides) || !item.slides.length ||
    item.slides.some(slide => !slide || typeof slide.id !== 'string' || !Array.isArray(slide.elements)) || !item.theme)) {
    throw new Error('invalid-library')
  }
  return parsed.templates
}
export function writeTemplateLibrary(storage: LibraryStorage, templates: PersonalTemplate[]) {
  const value = JSON.stringify({ version: 1, templates })
  // localStorage uses UTF-16; reject oversized writes before replacing the previous library.
  if (value.length * 2 > TEMPLATE_LIBRARY_LIMIT) throw new Error('library-full')
  storage.setItem(TEMPLATE_LIBRARY_KEY, value)
}

/** Materialize session-only media before persisting. Remote links remain links, visibly disclosed in the UI. */
export async function portableTemplateSlides(slides: readonly Slide[]): Promise<Slide[]> {
  const clone: Slide[] = JSON.parse(JSON.stringify(slides))
  const cache = new Map<string, Promise<string>>()
  const convert = (src: string): Promise<string> => {
    if (!src.startsWith('blob:')) return Promise.resolve(src)
    const known = persistableMediaSrc(src)
    if (!known.startsWith('blob:')) return Promise.resolve(known)
    let pending = cache.get(src)
    if (!pending) {
      pending = (async () => {
        const blob = getInternedBlob(src) ?? await fetch(src).then(response => {
          if (!response.ok) throw new Error('media-unavailable')
          return response.blob()
        })
        if (blob.size > TEMPLATE_LIBRARY_LIMIT / 2) throw new Error('library-full')
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error('media-unavailable'))
          reader.readAsDataURL(blob)
        })
      })()
      cache.set(src, pending)
    }
    return pending
  }
  const walk = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === 'string' && child.startsWith('blob:')) (value as Record<string, unknown>)[key] = await convert(child)
      else if (child && typeof child === 'object') await walk(child)
    }
  }
  await walk(clone)
  return clone
}

/** Clone every identity and reference. Never re-use IDs from a stored design. */
export function instantiateTemplate(template: PersonalTemplate, width: number, height: number): Slide[] {
  const slides = instantiateTemplateSlides(template.slides, { preserveExternalSlideLinks: false })
  for (const slide of slides) {
    delete slide.sourcePackageId
    delete slide.skeleton
    // Templates contain artwork; old comments and speaker notes must not leak into new projects.
    delete slide.notes
    delete slide.remark
    for (const element of slide.elements) {
      delete element.source
      // Resolve implicit theme defaults so inserted artwork retains its appearance.
      if (element.type === 'text') {
        element.defaultFontName ||= template.theme.fontName
        element.defaultColor ||= template.theme.fontColor
      }
    }
    slide.background ??= { type: 'solid', color: template.theme.backgroundColor }
  }
  return resizeDeckSlides(slides, { width: template.width, height: template.height }, { width, height })
}
export function rankTemplates(templates: PersonalTemplate[], width: number, height: number, sort: 'match' | 'recent' = 'match') {
  const distance = (item: PersonalTemplate) => Math.abs(Math.log((item.width / item.height) / (width / height)))
  return [...templates].sort((a, b) => sort === 'recent'
    ? (b.lastUsedAt || b.createdAt) - (a.lastUsedAt || a.createdAt)
    : distance(a) - distance(b) || b.updatedAt - a.updatedAt)
}
