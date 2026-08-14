declare const __FIKA_EXTRAS_ENABLED__: boolean;
declare module 'markdown-it-texmath' {
  import type { ComponentType } from 'react';
  import type MarkdownIt from 'markdown-it';
  const plugin: (md: MarkdownIt, options: unknown) => void;
  export default plugin;
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string }
  export default classes
}
declare module '*.svg?raw' {
  const src: string
  export default src
}
interface HTMLElement {
  webkitRequestFullScreen(options?: FullscreenOptions): Promise<void>;
  mozRequestFullScreen(options?: FullscreenOptions): Promise<void>;
  msRequestFullscreen(options?: FullscreenOptions): Promise<void>;
}
interface Document {
  webkitFullscreenElement: Element | null;
  mozFullScreenElement: Element | null;
  msFullscreenElement: Element | null;
  webkitCurrentFullScreenElement: Element | null;
  mozCancelFullScreen(): Promise<void>;
  webkitExitFullscreen(): Promise<void>;
  msExitFullscreen(): Promise<void>;
}
declare module 'txml' {
  export type tNode = {
    tagName: string;
    attributes: Record<string, string | null>;
    children: Array<tNode | string>;
  };
  export function parse(S: string, options?: object): Array<tNode | string>;
}
