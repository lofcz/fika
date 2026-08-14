import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRsbuild } from '@rsbuild/core'

/**
 * Bundle a TS entry (with `@/` aliases) to a temp ESM file and import it.
 * Used by Node check scripts that used to call `vite.build({ build.ssr })`.
 */
export async function bundleEntry(root, entry, fileName) {
  const rsbuild = await createRsbuild({
    cwd: root,
    rsbuildConfig: {
      logLevel: 'error',
      source: {
        entry: {
          main: join(root, entry),
        },
      },
      resolve: {
        alias: {
          '@': join(root, 'src'),
          katex: join(root, 'src/utils/katex-stub.ts'),
        },
      },
      output: {
        target: 'node',
        module: true,
        minify: false,
        sourceMap: false,
        cleanDistPath: false,
        filenameHash: false,
        distPath: {
          root: join(root, 'node_modules/.cache/agentic-check'),
          js: './',
        },
        filename: {
          js: fileName,
        },
        legalComments: 'none',
      },
      tools: {
        htmlPlugin: false,
      },
    },
  })
  await rsbuild.build()
  return import(pathToFileURL(join(root, 'node_modules/.cache/agentic-check', fileName)).href)
}
