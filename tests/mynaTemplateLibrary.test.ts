import { describe, expect, it } from '@rstest/core'
import { instantiateTemplate, rankTemplates, readTemplateLibrary, writeTemplateLibrary, portableTemplateSlides, TEMPLATE_LIBRARY_KEY, type PersonalTemplate } from '@/views/Myna/templateLibrary'
import type { SlideTheme, Slide } from '@/types/slides'
const theme = { backgroundColor: '#fff', fontName: 'Arial', fontColor: '#123456' } as SlideTheme
const element = { id: 'text', type: 'text', left: 20, top: 20, width: 100, height: 30, content: '<p>Hello</p>', groupId: 'group', link: { type: 'slide', target: 'second' } }
const source = (): PersonalTemplate => ({ id: 'template', name: 'Saved', width: 1000, height: 1000, theme, createdAt: 1, updatedAt: 1, lastUsedAt: 0, favorite: false,
  slides: [{ id: 'first', elements: [element, { ...element, id: 'other', link: { type: 'slide', target: 'outside' } }], guides: [{ id: 'guide', axis: 'x', position: 500 }], animations: [{ id: 'anim', elId: 'text', type: 'fadeIn' }], notes: [{ id: 'comment', content: 'private', time: 1, user: 'me' }], remark: 'private', sectionTag: { id: 'section', title: 'Chapter' } }, { id: 'second', elements: [], sectionTag: { id: 'section', title: 'Chapter' } }] as Slide[] })

describe('personal template library', () => {
  it('instantiates all pages with fresh coherent identities, links, groups, guides and animation targets', () => {
    const template = source()
    const before = JSON.stringify(template)
    const pages = instantiateTemplate(template, 1000, 1000)
    const secondUse = instantiateTemplate(template, 1000, 1000)
    expect(pages.map(page => page.id)).not.toEqual(template.slides.map(page => page.id))
    expect(pages[0].id).not.toBe(secondUse[0].id)
    expect(pages[0].elements[0].groupId).toBe(pages[0].elements[1].groupId)
    expect(pages[0].elements[0].groupId).not.toBe('group')
    expect(pages[0].elements[0].link?.target).toBe(pages[1].id)
    expect(pages[0].elements[1].link).toBeUndefined()
    expect(pages[0].animations?.[0].elId).toBe(pages[0].elements[0].id)
    expect(pages[0].guides?.[0].id).not.toBe('guide')
    expect(pages[0].sectionTag?.id).toBe(pages[1].sectionTag?.id)
    expect(pages[0].notes).toBeUndefined()
    expect(pages[0].remark).toBeUndefined()
    expect(pages[0].background).toEqual({ type: 'solid', color: '#fff' })
    expect(JSON.stringify(template)).toBe(before)
  })
  it('adapts pages to another size and ranks aspect ratio matches before recency', () => {
    const template = source()
    const scaled = instantiateTemplate(template, 500, 500)
    expect(scaled[0].guides?.[0].position).toBe(250)
    const wide = { ...template, id: 'wide', width: 2000, updatedAt: 50, lastUsedAt: 90 }
    expect(rankTemplates([wide, template], 1000, 1000).map(item => item.id)).toEqual(['template', 'wide'])
    expect(rankTemplates([template, wide], 1000, 1000, 'recent')[0].id).toBe('wide')
  })
  it('round-trips versioned storage and refuses invalid or oversized replacement without losing originals', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    writeTemplateLibrary(storage, [source()])
    const before = values.get(TEMPLATE_LIBRARY_KEY)
    expect(readTemplateLibrary(storage)[0].slides).toEqual(source().slides)
    expect(() => writeTemplateLibrary(storage, [{ ...source(), name: 'x'.repeat(3 * 1024 * 1024) }])).toThrow('library-full')
    expect(values.get(TEMPLATE_LIBRARY_KEY)).toBe(before)
    values.set(TEMPLATE_LIBRARY_KEY, '{bad')
    expect(() => readTemplateLibrary(storage)).toThrow()
    values.set(TEMPLATE_LIBRARY_KEY, JSON.stringify({ version: 2, templates: [] }))
    expect(() => readTemplateLibrary(storage)).toThrow('invalid-library')
  })
  it('never mutates live slides while preparing portable media and rejects expired blob references', async () => {
    const slides = [{ id: 'page', elements: [], background: { type: 'image', image: { src: 'data:image/png;base64,aA==', size: 'cover' } } }] as Slide[]
    const portable = await portableTemplateSlides(slides)
    expect(portable).toEqual(slides)
    expect(portable[0]).not.toBe(slides[0])
    const invalid = [{ id: 'page', elements: [], background: { type: 'image', image: { src: 'blob:expired', size: 'cover' } } }] as Slide[]
    await expect(portableTemplateSlides(invalid)).rejects.toThrow()
    expect(invalid[0].background?.image?.src).toBe('blob:expired')
  })
})
