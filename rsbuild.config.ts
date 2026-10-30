import { defineConfig } from '@rsbuild/core'
import {
  resolveAlias,
  sharedCssModules,
  sharedPlugins,
  sharedRspack,
  sharedSourceDefine,
  sharedTsconfigPath,
} from './rsbuild.shared'

export default defineConfig(({ command }) => {
  const isDev = command === 'dev'
  const isCI = process.env.CI === 'true' || process.env.CI === '1'

  return {
    plugins: sharedPlugins(),
    // Browser tests need a stable document and workers, without reload messages.
    dev: { hmr: !isCI, liveReload: !isCI },
    html: {
      template: './index.html',
      inject: 'body',
      favicon: './public/favicon.svg',
    },
    source: {
      tsconfigPath: sharedTsconfigPath,
      entry: {
        index: isDev && !isCI
          ? ['./src/react-scan.dev.ts', './src/main.tsx']
          : './src/main.tsx',
      },
      define: sharedSourceDefine,
    },
    resolve: {
      alias: resolveAlias,
    },
    output: {
      assetPrefix: isDev ? '/' : './',
      cssModules: sharedCssModules,
    },
    splitChunks: {
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
          name: 'react',
          chunks: 'all',
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      headers: {
        'Document-Policy': 'js-profiling',
      },
      proxy: {
        '/api': {
          target: 'https://server.fika.cn',
          changeOrigin: true,
          pathRewrite: { '^/api': '' },
        },
      },
    },
    tools: {
      rspack: sharedRspack(),
    },
  }
})
