
import type { ImageElementFilters, ImageElementFilterKeys } from '@/types/slides';
export default (filters: any) => {
  const filter = (() => {
    if (!filters) return '';
    let filter = '';
    const keys = Object.keys(filters) as ImageElementFilterKeys[];
    for (const key of keys) {
      filter += `${key}(${filters[key]}) `;
    }
    return filter;
  })();
  return {
    filter
  };
};
