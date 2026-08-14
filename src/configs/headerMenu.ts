import type { FikaHeaderMenuItem } from '@/embed/types';
let headerMenuItems: FikaHeaderMenuItem[] = [];

/** Host-configured extra entries for the editor header's screening dropdown. */
export function setFikaHeaderMenuItems(items?: FikaHeaderMenuItem[]) {
  headerMenuItems = items?.length ? items : [];
}
export function getFikaHeaderMenuItems(): readonly FikaHeaderMenuItem[] {
  return headerMenuItems;
}
