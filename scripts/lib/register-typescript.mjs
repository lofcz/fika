import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { rspack } from '@rsbuild/core'

// These checks execute real source modules, including enums that Node's default
// strip-only loader cannot handle. Keep the same transform on Node 24 and newer.
registerHooks({
  load(url, context, nextLoad) {
    if (!url.startsWith('file:') || !url.endsWith('.ts')) return nextLoad(url, context)
    return {
      format: 'module',
      source: rspack.experiments.swc.transformSync(readFileSync(new URL(url), 'utf8'), {
        filename: new URL(url).pathname,
        jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
        module: { type: 'es6' },
      }).code,
      shortCircuit: true,
    }
  },
})
