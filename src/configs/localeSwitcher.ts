/** Host-configured locale switcher in the editor header's right cluster. Off by default. */
let localeSwitcherEnabled = false;
export function setFikaLocaleSwitcherEnabled(enabled?: boolean) {
  localeSwitcherEnabled = !!enabled;
}
export function isFikaLocaleSwitcherEnabled(): boolean {
  return localeSwitcherEnabled;
}
