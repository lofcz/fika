export interface CodeEditorPayload {
  code: string;
  language: string;
  theme: string;
  fontSize: number;
  showLineNumbers: boolean;
}
export const DEFAULT_CODE_LANGUAGE = 'typescript';
export const DEFAULT_CODE_THEME = 'github-dark';
export const DEFAULT_CODE_FONT_SIZE = 18;
export const DEFAULT_CODE_WIDTH = 640;
export const DEFAULT_CODE_HEIGHT = 360;
export const CODE_PAD_X = 16;
export const CODE_PAD_Y = 12;
export const CODE_LINE_HEIGHT = 1.5;
const CODE_CHAR_WIDTH = 0.62;
const CODE_GUTTER_EM = 3.4;
export function measureCodeElementSize(data: Pick<CodeEditorPayload, 'code' | 'fontSize' | 'showLineNumbers'>) {
  const lines = data.code.split('\n');
  const lineCount = Math.max(1, lines.length);
  const maxChars = lines.reduce((max, line) => Math.max(max, line.replace(/\t/g, '  ').length), 1);
  const gutter = data.showLineNumbers ? data.fontSize * CODE_GUTTER_EM : 0;
  const width = Math.round(Math.min(DEFAULT_CODE_WIDTH, Math.max(280, CODE_PAD_X * 2 + gutter + maxChars * data.fontSize * CODE_CHAR_WIDTH + 8)));
  const height = Math.round(Math.min(DEFAULT_CODE_HEIGHT, CODE_PAD_Y * 2 + lineCount * data.fontSize * CODE_LINE_HEIGHT));
  return {
    width,
    height
  };
}
export const DEFAULT_CODE_SAMPLE = `function greet(name: string) {
  return \`Hello, \${name}!\`
}

console.log(greet('world'))`;
export const CODE_LANGUAGES = [{
  id: 'typescript',
  label: 'TypeScript'
}, {
  id: 'javascript',
  label: 'JavaScript'
}, {
  id: 'python',
  label: 'Python'
}, {
  id: 'json',
  label: 'JSON'
}, {
  id: 'html',
  label: 'HTML'
}, {
  id: 'css',
  label: 'CSS'
}, {
  id: 'vue',
  label: 'Vue'
}, {
  id: 'rust',
  label: 'Rust'
}, {
  id: 'go',
  label: 'Go'
}, {
  id: 'java',
  label: 'Java'
}, {
  id: 'csharp',
  label: 'C#'
}, {
  id: 'cpp',
  label: 'C++'
}, {
  id: 'sql',
  label: 'SQL'
}, {
  id: 'bash',
  label: 'Bash'
}, {
  id: 'markdown',
  label: 'Markdown'
}, {
  id: 'yaml',
  label: 'YAML'
}, {
  id: 'xml',
  label: 'XML'
}, {
  id: 'php',
  label: 'PHP'
}, {
  id: 'ruby',
  label: 'Ruby'
}, {
  id: 'swift',
  label: 'Swift'
}, {
  id: 'kotlin',
  label: 'Kotlin'
}, {
  id: 'plaintext',
  label: 'Plain text'
}] as const;
export type CodeLanguageId = (typeof CODE_LANGUAGES)[number]['id'];
export const CODE_LANGUAGE_ALIASES: Record<string, CodeLanguageId> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  text: 'plaintext',
  txt: 'plaintext',
  plain: 'plaintext'
};
export const CODE_THEMES = [{
  id: 'github-dark',
  label: 'GitHub Dark'
}, {
  id: 'github-light',
  label: 'GitHub Light'
}, {
  id: 'synthwave-84',
  label: "Synthwave '84"
}, {
  id: 'laserwave',
  label: 'LaserWave'
}, {
  id: 'aurora-x',
  label: 'Aurora X'
}, {
  id: 'andromeeda',
  label: 'Andromeeda'
}, {
  id: 'houston',
  label: 'Houston'
}, {
  id: 'dracula',
  label: 'Dracula'
}, {
  id: 'tokyo-night',
  label: 'Tokyo Night'
}, {
  id: 'night-owl',
  label: 'Night Owl'
}, {
  id: 'horizon',
  label: 'Horizon'
}, {
  id: 'monokai',
  label: 'Monokai'
}, {
  id: 'plastic',
  label: 'Plastic'
}, {
  id: 'poimandres',
  label: 'Poimandres'
}, {
  id: 'ayu-dark',
  label: 'Ayu Dark'
}, {
  id: 'ayu-mirage',
  label: 'Ayu Mirage'
}, {
  id: 'vesper',
  label: 'Vesper'
}, {
  id: 'rose-pine',
  label: 'Rosé Pine'
}, {
  id: 'rose-pine-moon',
  label: 'Rosé Pine Moon'
}, {
  id: 'material-theme-palenight',
  label: 'Material Palenight'
}, {
  id: 'material-theme-ocean',
  label: 'Material Ocean'
}, {
  id: 'kanagawa-wave',
  label: 'Kanagawa Wave'
}, {
  id: 'one-dark-pro',
  label: 'One Dark Pro'
}, {
  id: 'one-light',
  label: 'One Light'
}, {
  id: 'catppuccin-mocha',
  label: 'Catppuccin Mocha'
}, {
  id: 'catppuccin-macchiato',
  label: 'Catppuccin Macchiato'
}, {
  id: 'catppuccin-frappe',
  label: 'Catppuccin Frappé'
}, {
  id: 'catppuccin-latte',
  label: 'Catppuccin Latte'
}, {
  id: 'vitesse-dark',
  label: 'Vitesse Dark'
}, {
  id: 'vitesse-light',
  label: 'Vitesse Light'
}, {
  id: 'nord',
  label: 'Nord'
}, {
  id: 'min-dark',
  label: 'Min Dark'
}, {
  id: 'min-light',
  label: 'Min Light'
}] as const;
export type CodeThemeId = (typeof CODE_THEMES)[number]['id'];
export function resolveCodeLanguage(language: string): CodeLanguageId {
  const id = language.trim().toLowerCase();
  if ((CODE_LANGUAGES as readonly {
    id: string;
  }[]).some(item => item.id === id)) {
    return id as CodeLanguageId;
  }
  return CODE_LANGUAGE_ALIASES[id] ?? DEFAULT_CODE_LANGUAGE;
}
export function resolveCodeTheme(theme: string): CodeThemeId {
  const id = theme.trim().toLowerCase();
  if ((CODE_THEMES as readonly {
    id: string;
  }[]).some(item => item.id === id)) {
    return id as CodeThemeId;
  }
  return DEFAULT_CODE_THEME;
}
export function isLightCodeTheme(theme: string) {
  const id = resolveCodeTheme(theme);
  return id.includes('light') || id.endsWith('latte');
}
