import type { FikaExportTabsConfig } from '@/configs/exportTabs';
import type { FikaExportMediaResolver } from '@/configs/exportMediaResolver';
import type { FikaMediaConfig } from '@/configs/mediaUpload';
import type { Locales } from '@/i18n/locale';
import type { Slide, SlideTheme, SlideTemplate } from '@/types/slides';
import type { FikaAgentApi, FikaDeckViewport, FikaSlideReference } from './agentic/types';
export type { FikaExportMediaResolver };
export type { FikaMediaConfig, FikaMediaConstraints, FikaMediaKind, FikaMediaSizeLimit, FikaMediaUploadProgress, FikaMediaUploadRequest, FikaMediaUploadResult, FikaMediaUploader, FikaXhrMediaUploaderOptions } from '@/configs/mediaUpload';
export interface FikaTemplatePayload {
  title?: string;
  width?: number;
  height?: number;
  slides: Slide[];
  theme?: Partial<SlideTheme>;
}
export type FikaTemplateLoader = () => Promise<FikaTemplatePayload | Slide[]>;
export type FikaDocumentLoader = () => Promise<FikaDocument | null | undefined>;
export interface FikaStarterPresentationOptions {
  title?: string;
  titlePlaceholder?: string;
  subtitlePlaceholder?: string;
  bodyPlaceholder?: string;
  titleFontSize?: number;
  subtitleFontSize?: number;
  contentTitleFontSize?: number;
  bodyFontSize?: number;
  placeholderColor?: string;
  fontName?: string;
  fontColor?: string;
  backgroundColor?: string;
}

/** Serializable deck passed between the embedding host and Fika. */
export interface FikaDocument {
  title: string;
  slides: Slide[];
  theme?: Partial<SlideTheme>;
  /** Slide coordinate space. Omitted payloads keep the engine default (1000 × 16:9). */
  viewport?: Partial<FikaDeckViewport>;
}

/**
 * Host-configured extra entry appended to the editor header's screening
 * dropdown (below "from start" / "from current slide"). Labels are supplied by
 * the host so no engine i18n keys are needed.
 */
export interface FikaHeaderMenuItem {
  /** Stable id echoed back in `onSelect`. */
  id: string;
  /** Menu item label (host-localized). */
  label: string;
  /**
   * Optional Lucide kebab-case name (`link`, `share-2`, `globe`, `cloud`)
   * rendered before the label. Only a curated set is supported; unknown names
   * render no icon.
   */
  icon?: string;
  /** Fired when the entry is clicked (the dropdown closes first). */
  onSelect?: (id: string) => void;
}

/** `editor` is the default full editor; `presentation` boots straight into the fullscreen slideshow with no editor chrome. */
export type FikaViewMode = 'editor' | 'presentation';
export interface FikaMountOptions {
  /** UI locale (`cs` | `en` | `sk` | `pl`). */
  locale?: Locales;
  /** Initial deck; takes precedence over `loadDocument` and the starter slide. */
  document?: FikaDocument;
  /** Optional async document loader for hosts that resolve a deck from the current URL/session. */
  loadDocument?: FikaDocumentLoader;
  /** Legacy demo behavior: when explicitly true, load `mocks/slides.json` instead of the starter slide. */
  loadMockOnEmpty?: boolean;
  /** Set false when the embed host renders its own empty/loading state. */
  showLoadingData?: boolean;
  /** Customize the default one-slide starter deck used when no existing document is loaded. */
  starterPresentation?: FikaStarterPresentationOptions;
  /** Base URL for runtime image/font assets and fallback mock decks. */
  assetBaseUrl?: string;
  /**
   * Host-supplied template catalog shown in the design picker.
   * Payload JSON is resolved with `templateLoaders` keyed by `templates[].id`.
   */
  templates?: SlideTemplate[];
  /** Optional custom template payload loaders keyed by `templates[].id`. */
  templateLoaders?: Record<string, FikaTemplateLoader>;
  /** Fired when title, slides, or theme change (debounced). */
  onChange?: (document: FikaDocument) => void;
  onChangeDebounceMs?: number;
  /** Fired when Fika enters or exits slideshow/presentation mode. */
  onPresentationModeChange?: (screening: boolean) => void;
  /**
   * Toggle export dialog formats (`pptx`, `json`). Omitted keys stay enabled.
   */
  exportTabs?: FikaExportTabsConfig;
  /**
   * Same-origin fallback when a direct browser fetch of an http(s) media URL
   * fails (typically CORS on third-party hosts). Should return a `data:` URL
   * or null/undefined to give up on that source.
   */
  exportMediaResolver?: FikaExportMediaResolver;
  /**
   * Local media picker used by the unified Insert → Media action (images,
   * video, and audio). Pass `upload` to send files to your backend instead of
   * embedding data/blob URLs. Constraints (count, size, MIME, extensions) are
   * enforced in the picker before upload.
   */
  media?: FikaMediaConfig;
  /**
   * Extra entries appended to the editor header's screening dropdown. Lets an
   * embedding host surface its own actions (e.g. "create public share link")
   * inside the engine UI without touching the engine's i18n.
   */
  headerMenuItems?: FikaHeaderMenuItem[];
  /**
   * Show a locale switcher at the end of the editor header's right cluster.
   * Off by default — embedding hosts typically drive locale themselves.
   * The standalone demo page turns this on.
   */
  showLocaleSwitcher?: boolean;
  /**
   * When true (default), selecting a text range opens the right style panel
   * after the pointer is released. Persisted in localStorage; an explicit
   * value here wins for this mount.
   */
  openPanelOnTextSelection?: boolean;
  /**
   * `presentation` mounts a presentation-only viewer: once the deck resolves,
   * the fullscreen slideshow starts immediately and the editor never renders.
   * Exiting the slideshow re-enters it, so the page stays a pure viewer.
   */
  viewMode?: FikaViewMode;
}
export type FikaImportApplyMode = import('@/utils/importApply').ImportApplyMode;
export interface FikaImportPptxOptions {
  /**
   * `replace` (default) overwrites the current deck. `append` inserts after
   * the current slide. An empty deck (0 slides) is always replaced.
   */
  mode?: FikaImportApplyMode;
  /**
   * Legacy alias for `mode`: `true` replace, `false` append.
   * Prefer `mode`.
   */
  cover?: boolean;
  /**
   * When replacing a deck that already has more than one slide, ask the user
   * first. The editor UI defaults to `true`; `importPptx` defaults to `false`.
   */
  confirm?: boolean;
  /** Normalize the imported deck to the fixed 1000px viewport width. */
  fixedViewport?: boolean;
  /**
   * Repair unreadable text colors after import (painter's-algorithm
   * background query + WCAG contrast). Intended for AI-generated decks;
   * leave off for genuine user files.
   */
  fixContrast?: boolean;
  /**
   * Override imported transitions. A single mode applies to every slide;
   * an array or 0-/1-based index map sets individual slides. Missing entries
   * keep the file transition, or Rise when the file has none.
   */
  turningMode?: import('@/types/slides').TurningMode | Array<import('@/types/slides').TurningMode | null | undefined> | Record<number, import('@/types/slides').TurningMode>;
  /** Fallback when a slide has no file transition and no per-slide override. */
  defaultTurningMode?: import('@/types/slides').TurningMode;
}

/** Public embed controller: legacy host methods plus the generic command and domain APIs. */
export interface FikaController extends FikaAgentApi {
  getDocument(): FikaDocument;
  setDocument(document: FikaDocument): void;
  /**
   * Parse a `.pptx` file and load it into the editor (same converter as the
   * editor's Import menu — pptxtojson + fidelity extras). Resolves `true` once
   * the deck is applied to the store (the `onChange` document follows), or
   * `false` when the file could not be parsed.
   */
  importPptx(data: File | Blob | ArrayBuffer, options?: FikaImportPptxOptions): Promise<boolean>;
  setTitle(title: string): void;
  setLocale(locale: Locales): Promise<void>;
  /**
   * Paint one slide offscreen (thumbnail painter, no DOM capture) and return
   * the encoded image. Defaults to the current slide.
   */
  renderSlide(slideIdOrIndex?: FikaSlideReference, options?: import('./render').FikaRenderSlideOptions): Promise<{ blob: Blob; width: number; height: number } | null>;
  /**
   * Paint the whole deck as numbered contact sheets — what an agent should
   * look at before editing an existing deck, or after its context was
   * compacted. Long decks split across several sheets.
   */
  renderAtlas(options?: import('./render').FikaDeckAtlasOptions): Promise<import('./render').FikaDeckAtlasSheet[]>;
  goToSlide(slideIdOrIndex: FikaSlideReference): void;
  nextSlide(): void;
  previousSlide(): void;
  setZoom(scale: number): void;
  enterPresentation(): void;
  exitPresentation(): void;
  destroy(): void;
}
export interface FikaMountResult {
  controller: FikaController;
  /** Alias for `controller.destroy()`. */
  app: { unmount: () => void };
}
