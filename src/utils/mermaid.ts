type MermaidAPI = {
  initialize: (config: Record<string, unknown>) => void;
  render: (id: string, code: string) => Promise<{
    svg: string;
  }>;
};
type DOMPurifyAPI = {
  sanitize: (dirty: string, config?: Record<string, unknown>) => string;
};

export class MermaidRenderSuperseded extends Error {
  constructor() {
    super('superseded')
    this.name = 'MermaidRenderSuperseded'
  }
}

export const isMermaidRenderSuperseded = (err: unknown) => (
  err instanceof MermaidRenderSuperseded
  || (err instanceof Error && err.name === 'MermaidRenderSuperseded')
)

let mermaidPromise: Promise<MermaidAPI> | null = null;
let purifyPromise: Promise<DOMPurifyAPI> | null = null;
let readyPromise: Promise<[MermaidAPI, DOMPurifyAPI]> | null = null;
let mermaidReady = false;
let renderIndex = 0;
/**
 * Supersede tokens are per render `key` (element id, editor, thumbnail hash).
 * A single global token would make concurrent consumers — several thumbnails,
 * the on-canvas element, the editor preview — cancel each other's renders.
 */
const renderTokens = new Map<string, number>();
let exclusive: Promise<unknown> = Promise.resolve();

/** Lazily load + configure mermaid (kept out of the initial embed graph). */
function ensureMermaid(): Promise<MermaidAPI> {
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = import('mermaid').then(mod => {
    const api = (mod.default ?? mod) as MermaidAPI;
    api.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      htmlLabels: false
    });
    return api;
  });
  return mermaidPromise;
}
function ensureDOMPurify(): Promise<DOMPurifyAPI> {
  if (purifyPromise) return purifyPromise;
  purifyPromise = import('dompurify').then(mod => {
    return (mod.default ?? mod) as DOMPurifyAPI;
  });
  return purifyPromise;
}

export const whenMermaidReady = () => {
  readyPromise ??= Promise.all([ensureMermaid(), ensureDOMPurify()]).then(pair => {
    mermaidReady = true
    return pair
  })
  return readyPromise
}

export const prefetchMermaid = () => {
  void whenMermaidReady()
}

export const isMermaidReady = () => mermaidReady

const paintSvg = (svg: string, DOMPurify: DOMPurifyAPI) => {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgElement = document.documentElement;
  svgElement.setAttribute('width', '100%');
  svgElement.setAttribute('height', '100%');
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgElement.style.maxWidth = 'none';
  return DOMPurify.sanitize(new XMLSerializer().serializeToString(svgElement), {
    USE_PROFILES: {
      svg: true,
      svgFilters: true
    }
  });
}

export const renderMermaid = async (code: string, key = 'diagram') => {
  const mine = (renderTokens.get(key) ?? 0) + 1
  renderTokens.set(key, mine)
  const [mermaid, DOMPurify] = await whenMermaidReady()
  if (mine !== renderTokens.get(key)) throw new MermaidRenderSuperseded()

  const run = exclusive.then(async () => {
    if (mine !== renderTokens.get(key)) throw new MermaidRenderSuperseded()
    const safeKey = key.replace(/[^a-zA-Z0-9]/g, '') || 'diagram'
    const id = `mermaid${safeKey}${renderIndex++}`
    const { svg } = await mermaid.render(id, code)
    if (mine !== renderTokens.get(key)) throw new MermaidRenderSuperseded()
    return paintSvg(svg, DOMPurify)
  })
  exclusive = run.then(() => undefined, () => undefined)
  return run
}
