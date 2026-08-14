import { defineConfig } from '@rsbuild/core'
import {
  resolveAlias,
  sharedCssModules,
  sharedPlugins,
  sharedRspack,
  sharedSourceDefine,
  sharedTsconfigPath,
} from './rsbuild.shared'

export default defineConfig({
  plugins: sharedPlugins(),
  source: {
    tsconfigPath: sharedTsconfigPath,
    entry: {
      'fika-embed': './src/embed/index.ts',
    },
    define: sharedSourceDefine,
  },
  resolve: {
    alias: resolveAlias,
  },
  output: {
    target: 'web',
    module: true,
    distPath: {
      root: 'dist/embed',
      js: '',
      css: '',
      jsAsync: 'chunks',
      cssAsync: 'chunks',
    },
    autoExternal: {
      dependencies: false,
      optionalDependencies: false,
      peerDependencies: true,
    },
    filenameHash: false,
    filename: {
      js: '[name].js',
      css: '[name].css',
      font: 'fonts/[name][ext]',
    },
    dataUriLimit: 0,
    sourceMap: false,
    cleanDistPath: true,
    cssModules: sharedCssModules,
    legalComments: 'none',
  },
  // Default split-by-experience: keep import() lazy chunks. Do not use all-in-one.
  tools: {
    htmlPlugin: false,
    rspack(config) {
      const shared = sharedRspack()
      config.module ??= {}
      config.module.parser = {
        ...config.module.parser,
        ...shared.module.parser,
      }
      config.output ??= {}
      config.output.library = { type: 'module' }
      config.experiments = { ...config.experiments, outputModule: true }
    },
  },
})
