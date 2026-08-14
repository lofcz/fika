/**
 * Human-authored documentation for the agentic bridge: the design system, a
 * per-domain and per-command authoring guide, and reusable slide composition
 * recipes. The content lives in `docs.json` (single source) so it can be both
 * (a) bundled for the runtime `controller.describe()` / `controller.guides()`
 * helpers and (b) read at build time and merged into `agentic-manifest.json`
 * for server-side skill catalogs in an embedding host.
 */
import docsJson from './docs.json';
export interface FikaDocParam {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}
export interface FikaCommandDoc {
  summary?: string;
  details?: string;
  params?: FikaDocParam[];
  examples?: string[];
  tips?: string[];
  related?: string[];
}
export interface FikaDomainDoc {
  title: string;
  summary: string;
  whenToUse?: string;
}
export interface FikaDesignGuide {
  id: string;
  title: string;
  summary: string;
  /** Body lines (join with "\n" to render). */
  body: string[];
}
export interface FikaDesignSystem {
  summary: string;
  coordinateSystem: {
    summary: string;
    notes: string[];
  };
  tokens: {
    summary?: string;
    colors?: Record<string, string>;
    fontFamily?: string;
    fontSizePx?: Record<string, number>;
    spacingPx?: Record<string, number>;
  };
}
export interface FikaAgenticDocs {
  version: number;
  summary: string;
  designSystem: FikaDesignSystem;
  domains: Record<string, FikaDomainDoc>;
  commands: Record<string, FikaCommandDoc>;
  guides: FikaDesignGuide[];
}

/** A command description merged with live registry facts (registered? mutates?). */
export interface FikaCommandDescription extends FikaCommandDoc {
  name: string;
  domain: string;
  registered: boolean;
  mutates: boolean;
}

/** A domain summary merged with the live registry command list. */
export interface FikaDomainSummary {
  id: string;
  title: string;
  summary: string;
  whenToUse?: string;
  commandCount: number;
  commands: string[];
}

/** Minimal structural view of the command registry needed for introspection. */
export type FikaCommandRegistryView = ReadonlyMap<string, {
  mutates: boolean;
}>;
export const AGENTIC_DOCS: FikaAgenticDocs = docsJson as unknown as FikaAgenticDocs;
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Describe a single command: its doc annotation plus live registry facts. */
export function describeAgenticCommand(registry: FikaCommandRegistryView, commandType: string): FikaCommandDescription | null {
  const doc = AGENTIC_DOCS.commands[commandType];
  const registered = registry.has(commandType);
  if (!doc && !registered) return null;
  return {
    name: commandType,
    domain: commandType.includes('.') ? commandType.split('.')[0] : commandType,
    registered,
    mutates: registry.get(commandType)?.mutates ?? false,
    ...(doc ? clone(doc) : {})
  };
}

/** List domains (from the live registry + docs) with their command names. */
export function listAgenticDomains(registry: FikaCommandRegistryView): FikaDomainSummary[] {
  const byDomain = new Map<string, Set<string>>();
  const add = (commandType: string) => {
    if (!commandType.includes('.')) return;
    const domain = commandType.split('.')[0];
    if (!byDomain.has(domain)) byDomain.set(domain, new Set());
    byDomain.get(domain)!.add(commandType);
  };
  for (const key of registry.keys()) add(key);
  for (const key of Object.keys(AGENTIC_DOCS.commands)) add(key);
  for (const domain of Object.keys(AGENTIC_DOCS.domains)) {
    if (!byDomain.has(domain)) byDomain.set(domain, new Set());
  }
  const summaries: FikaDomainSummary[] = [];
  for (const [id, commands] of byDomain) {
    const doc = AGENTIC_DOCS.domains[id];
    summaries.push({
      id,
      title: doc?.title ?? id,
      summary: doc?.summary ?? '',
      ...(doc?.whenToUse ? {
        whenToUse: doc.whenToUse
      } : {}),
      commandCount: commands.size,
      commands: [...commands].sort()
    });
  }
  return summaries.sort((a, b) => a.id.localeCompare(b.id));
}
