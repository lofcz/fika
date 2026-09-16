declare module 'markdown-it-texmath' {
  import type { PluginWithOptions } from 'markdown-it';
  const plugin: PluginWithOptions<{ delimiters: string[]; engine: { renderToString: (value: string) => string } }>;
  export default plugin;
}
