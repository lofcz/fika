import { useMemo } from 'react'
import type { TableTheme } from '@/types/slides';
import { getTableThemeColors } from '@/utils/element';

const EMPTY_THEME_COLORS = {
  header: '',
  stripe: '',
  stripeAlt: ''
};

export default (theme: TableTheme | undefined) => {
  const color = theme?.color;
  const themeColors = useMemo(() => (
    color ? getTableThemeColors(color) : EMPTY_THEME_COLORS
  ), [color]);
  return {
    themeColors
  };
};
