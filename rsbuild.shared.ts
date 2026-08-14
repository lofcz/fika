import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginSass } from '@rsbuild/plugin-sass'
const rootDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(rootDir, 'src')

export const EXTRAS_ENABLED = process.env.FIKA_EXTRAS_ENABLED === 'true'

export const resolveAlias: Record<string, string> = {
  '@': srcDir,
  '@/components/ColorSwatches': path.resolve(srcDir, 'components/ColorSwatches.tsx'),
  'perfect-freehand': path.resolve(rootDir, 'node_modules/perfect-freehand/dist/esm/index.mjs'),
  katex: path.resolve(srcDir, 'utils/katex-stub.ts'),
  'react-grab/package.json': path.resolve(rootDir, 'scripts/shims/react-grab-package.js'),
}

const variableScss = path.resolve(srcDir, 'assets/styles/variable.scss').replace(/\\/g, '/')
const mixinScss = path.resolve(srcDir, 'assets/styles/mixin.scss').replace(/\\/g, '/')

export function sharedPlugins() {
  return [
    pluginReact({
      reactCompiler: {
        target: '19',
      },
    }),
    pluginSass({
      sassLoaderOptions(config) {
        config.additionalData = (content: string, loaderContext: { resourcePath?: string }) => {
          const filename = loaderContext.resourcePath || ''
          if (filename.includes('variable.scss') || filename.includes('mixin.scss')) {
            return content
          }
          return `
            @use '${variableScss}' as *;
            @use '${mixinScss}' as *;
          ${content}`
        }
      },
    }),
    pluginNodePolyfill({
      include: ['buffer', 'events', 'stream', 'util', 'process', 'path', 'fs'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ]
}

/** Vite-compatible JSON named imports (`import { version } from 'pkg/package.json'`). */
export function sharedRspack() {
  return {
    module: {
      parser: {
        json: {
          namedExports: true,
        },
      },
    },
  }
}

export const sharedSourceDefine = {
  __FIKA_EXTRAS_ENABLED__: JSON.stringify(EXTRAS_ENABLED),
}

export const sharedTsconfigPath = './tsconfig.app.json'

export const sharedCssModules = {
  exportLocalsConvention: 'asIs' as const,
  namedExport: false,
}
