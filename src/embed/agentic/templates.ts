import { getLL } from '@/i18n/getLL';
import { isKnownTemplateId, listCustomTemplateIds, loadConfiguredTemplate, normalizeTemplatePayload, setCustomTemplateLoaders, type TemplatePayload, type TemplatePayloadLoader } from '@/configs/templates';
import { useSlidesStore } from '@/store/slides';
import type { PPTElement, Slide, SlideTheme, SlideTemplate, SlideType } from '@/types/slides';

const SLIDE_TYPES: SlideType[] = ['cover', 'contents', 'transition', 'content', 'end'];

export type FikaTemplateSummary = SlideTemplate;

export interface FikaTemplateCatalogQuery {
  /** Match one declared category. Category and tag comparisons trim whitespace and ignore case. */
  category?: string;
  /** Match every nonblank tag in addition to the category, when supplied. */
  tags?: readonly string[];
}

export interface FikaTemplateSlideEntry {
  /** Stable slug within this template, e.g. `cover_1`, `content_2`. */
  slug: string;
  type: SlideType;
  description: string;
  elementCount: number;
}

export type FikaTemplateSlidesCatalog = Record<SlideType, FikaTemplateSlideEntry[]>;

export interface FikaTemplateSlidesCatalogResult {
  templateId: string;
  templateName: string;
  slideCount: number;
  byType: FikaTemplateSlidesCatalog;
}

const templatePayloadCache = new Map<string, Promise<TemplatePayload>>();

export function registerTemplateLoaders(loaders?: Record<string, TemplatePayloadLoader>) {
  setCustomTemplateLoaders(loaders);
  templatePayloadCache.clear();
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function elementPreviewText(element: PPTElement): string | undefined {
  if (element.type === 'text') {
    const text = stripHtml(element.content);
    return text || undefined;
  }
  if (element.type === 'shape' && element.text?.content) {
    const text = stripHtml(element.text.content);
    return text || undefined;
  }
  return undefined;
}

function describeSlide(slide: Slide): string {
  const previews = slide.elements.map(elementPreviewText).filter((text): text is string => !!text).slice(0, 3);
  if (previews.length) return previews.join(' · ');
  const type = slide.type ?? 'content';
  const hasImage = slide.elements.some(el => el.type === 'image');
  const hasChart = slide.elements.some(el => el.type === 'chart');
  const parts = [`${type} layout`, `${slide.elements.length} elements`];
  if (hasImage) parts.push('includes image');
  if (hasChart) parts.push('includes chart');
  return parts.join(', ');
}

function slugForType(type: SlideType, indexWithinType: number): string {
  return `${type}_${indexWithinType}`;
}

export function listTemplateCatalog(query?: FikaTemplateCatalogQuery): FikaTemplateSummary[] {
  const storeTemplates = useSlidesStore.getState().templates.filter(item => isKnownTemplateId(item.id));
  const seen = new Set(storeTemplates.map(item => item.id));
  const fromStore = storeTemplates.map(item => ({
    id: item.id,
    name: item.name,
    cover: item.cover,
    ...(item.origin ? { origin: item.origin } : {}),
    ...(item.description !== undefined ? { description: item.description } : {}),
    ...(item.categories !== undefined ? { categories: [...item.categories] } : {}),
    ...(item.tags !== undefined ? { tags: [...item.tags] } : {}),
    ...(item.useWhen !== undefined ? { useWhen: item.useWhen } : {}),
    ...(item.avoidWhen !== undefined ? { avoidWhen: item.avoidWhen } : {})
  }));
  const fromLoaders = listCustomTemplateIds()
    .filter(id => !seen.has(id))
    .map(id => ({
      id,
      name: id,
      cover: ''
    }));
  const catalog: FikaTemplateSummary[] = [...fromStore, ...fromLoaders];
  const normalize = (value: string) => value.trim().toLowerCase();
  const category = normalize(query?.category ?? '');
  const tags = query?.tags?.map(normalize).filter(Boolean) ?? [];
  if (!category && !tags.length) return catalog;
  return catalog.filter(template => {
    if (category && !template.categories?.some(value => normalize(value) === category)) return false;
    const declared = template.tags?.map(normalize);
    return tags.every(tag => declared?.includes(tag));
  });
}

export async function loadTemplatePayload(templateId: string): Promise<TemplatePayload> {
  const cached = templatePayloadCache.get(templateId);
  if (cached) return cached;
  const request = loadConfiguredTemplate(templateId).then(async raw => {
    if (!raw) throw new Error(`Unknown template "${templateId}". Hosts register templates via mount options (templates + templateLoaders).`);
    return normalizeTemplatePayload(raw, getLL());
  });
  templatePayloadCache.set(templateId, request);
  return request;
}

export async function buildTemplateSlidesCatalog(templateId: string): Promise<FikaTemplateSlidesCatalogResult> {
  const payload = await loadTemplatePayload(templateId);
  const name = listTemplateCatalog().find(item => item.id === templateId)?.name ?? templateId;
  const counters: Record<SlideType, number> = {
    cover: 0,
    contents: 0,
    transition: 0,
    content: 0,
    end: 0
  };
  const byType: FikaTemplateSlidesCatalog = {
    cover: [],
    contents: [],
    transition: [],
    content: [],
    end: []
  };
  for (const slide of payload.slides) {
    const type = (slide.type && SLIDE_TYPES.includes(slide.type) ? slide.type : 'content') as SlideType;
    counters[type] += 1;
    const slug = slugForType(type, counters[type]);
    byType[type].push({
      slug,
      type,
      description: describeSlide(slide),
      elementCount: slide.elements.length
    });
  }
  return {
    templateId,
    templateName: name,
    slideCount: payload.slides.length,
    byType
  };
}

export function resolveTemplateSlide(payload: TemplatePayload, slug: string): {
  slide: Slide;
  type: SlideType;
} {
  const counters: Record<SlideType, number> = {
    cover: 0,
    contents: 0,
    transition: 0,
    content: 0,
    end: 0
  };
  for (const slide of payload.slides) {
    const type = (slide.type && SLIDE_TYPES.includes(slide.type) ? slide.type : 'content') as SlideType;
    counters[type] += 1;
    if (slugForType(type, counters[type]) === slug) {
      return {
        slide: structuredClone(slide),
        type
      };
    }
  }
  throw new Error(`Slide slug "${slug}" not found in template. Call templates.slidesCatalog for valid slugs.`);
}

export function assertKnownTemplateId(templateId: string): void {
  if (!isKnownTemplateId(templateId)) {
    throw new Error(`Unknown template "${templateId}". Hosts register templates via mount options (templates + templateLoaders).`);
  }
}

export function templateThemePatch(payload: TemplatePayload): Partial<SlideTheme> | undefined {
  return payload.theme ? structuredClone(payload.theme) : undefined;
}
