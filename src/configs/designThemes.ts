import { create } from 'zustand';
import tinycolor from 'tinycolor2';
import { PRESET_THEMES, type PresetTheme } from './theme';

/** Host-localized designs displayed in the slide design picker, in supplied order. */
export type FikaDesignTheme = Omit<PresetTheme, 'id' | 'name'> & { id: string; name: string };

/** Undefined restores Fika defaults; [] intentionally hides the preset catalog. */
export function resolveDesignThemes(themes?: readonly FikaDesignTheme[]): readonly PresetTheme[] {
  if (themes === undefined) return structuredClone(PRESET_THEMES);
  const ids = new Set<string>();
  for (const theme of themes) {
    if (!theme.id?.trim() || !theme.name?.trim()) throw new Error('Design themes need a nonempty id and name.');
    if (ids.has(theme.id)) throw new Error(`Duplicate design theme id: ${theme.id}`);
    ids.add(theme.id);
    if (!theme.colors?.length) throw new Error(`Design theme ${theme.id} needs accent colors.`);
    for (const color of [theme.background, theme.fontColor, ...theme.colors, ...(theme.chartColors ?? []), theme.featureFontColor, theme.borderColor].filter(value => value !== undefined)) {
      if (!tinycolor(color).isValid()) throw new Error(`Invalid color in design theme ${theme.id}: ${color}`);
    }
  }
  return structuredClone(themes);
}

export const useDesignThemes = create<{ themes: readonly PresetTheme[] }>(() => ({ themes: resolveDesignThemes() }));

/** Updates the catalog only; never restyles or replaces the host document. */
export function setFikaDesignThemes(themes?: readonly FikaDesignTheme[]) {
  useDesignThemes.setState({ themes: resolveDesignThemes(themes) });
}

/** Obtain independent copies of Fika's built-in designs for filtering/extending. */
export function getFikaDefaultDesignThemes(): FikaDesignTheme[] {
  return resolveDesignThemes() as FikaDesignTheme[];
}

/** Small JSON-safe catalog for host/agent discovery, not full document content. */
export function listFikaDesignThemes() {
  return useDesignThemes.getState().themes.map(theme => ({
    id: theme.id!, name: theme.name!, background: theme.background,
    fontColor: theme.fontColor, colors: [...theme.colors],
  }));
}

export function getFikaDesignTheme(id: string): PresetTheme {
  const theme = useDesignThemes.getState().themes.find(item => item.id === id);
  if (!theme) throw new Error(`Unknown design theme: ${id}. Available: ${listFikaDesignThemes().map(item => item.id).join(', ')}`);
  return structuredClone(theme);
}
