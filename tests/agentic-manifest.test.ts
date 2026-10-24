import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@rstest/core'
import { extractDecls, stripComments, validateCanvasOperations } from '../scripts/generate-agentic-manifest.mjs'

test('declarations retain documented union and intersection members across blank lines', () => {
  const declarations = extractDecls(stripComments(`
export type Operation = {
  op: 'shape';
}
/** Keep the entire image visible. */

 | {
  op: 'image';
  natural: { width: number; height: number };
} | {
  op: 'remove';
};
export type Combined = { a: string }
/** Additional fields. */
 & { b: number };
export interface Next { untouched: boolean; }
`))
  expect(declarations.get('Operation')).toBe("export type Operation = { op: 'shape' } | { op: 'image'; natural: { width: number; height: number } } | { op: 'remove' }")
  expect(declarations.get('Combined')).toBe('export type Combined = { a: string } & { b: number }')
  expect(declarations.get('Next')).toBe('export interface Next { untouched: boolean }')
})

test('generated canvas manifest retains every public operation and image payload', () => {
  execFileSync(process.execPath, [resolve('scripts/generate-agentic-manifest.mjs')], { cwd: resolve('.') })
  const declarations = readFileSync(resolve('dist/types/embed/agentic/types.d.ts'), 'utf8')
  const manifest = JSON.parse(readFileSync(resolve('dist/embed/agentic-manifest.json'), 'utf8'))
  expect(() => validateCanvasOperations(manifest, declarations)).not.toThrow()
  const schema = manifest.helperTypes.FikaCanvasOperation
  expect([...schema.matchAll(/\bop: '([^']+)'/g)].map(match => match[1])).toEqual([
    'title', 'viewport', 'page', 'pageUpdate', 'text', 'textUpdate', 'shape', 'image', 'element', 'update', 'remove',
  ])
  expect(schema).toContain('natural: { width: number; height: number }')
  expect(schema).toContain("fit?: 'contain' | 'cover'")
  expect(schema).toContain('sourceUrl?: string')
  const truncated = { ...manifest, helperTypes: { ...manifest.helperTypes, FikaCanvasOperation: schema.split(" | { op: 'image'")[0] } }
  expect(() => validateCanvasOperations(truncated, declarations)).toThrow('Canvas manifest operations differ')
})
