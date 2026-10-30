import { afterEach, describe, expect, it } from '@rstest/core'
import { certifySourcePackageDocument, clearAllSourcePackages, markSourcePackageDirty, retainSourcePackage, tryGetCleanRetainedPackage } from '../src/utils/pptxSourcePackage'

const deck = () => ({
  title: 'Imported', theme: { backgroundColor: '#fff' }, viewportSize: 1000, viewportRatio: 0.5625,
  slides: [{ id: 'a', sourcePackageId: 'package', elements: [] }, { id: 'b', sourcePackageId: 'package', elements: [] }],
})
afterEach(clearAllSourcePackages)

describe('retained PPTX export eligibility', () => {
  it('requires a certified full import, then allows an unchanged snapshot', () => {
    const state = deck()
    retainSourcePackage('package', new Uint8Array([1, 2, 3]).buffer)
    expect(tryGetCleanRetainedPackage(state.slides, state)).toBeNull()
    certifySourcePackageDocument('package', state)
    expect(new Uint8Array(tryGetCleanRetainedPackage(structuredClone(state.slides), state)!)).toEqual(new Uint8Array([1, 2, 3]))
    expect(tryGetCleanRetainedPackage(state.slides)).toBeNull()
  })

  it('rejects a subset, reordered pages, and edited pages even without a dirty notification', () => {
    const state = deck()
    retainSourcePackage('package', new ArrayBuffer(8))
    certifySourcePackageDocument('package', state)
    expect(tryGetCleanRetainedPackage(state.slides.slice(0, 1), state)).toBeNull()
    expect(tryGetCleanRetainedPackage([...state.slides].reverse(), state)).toBeNull()
    const edited = structuredClone(state.slides)
    Object.assign(edited[0], { note: 'Speaker notes edited' })
    expect(tryGetCleanRetainedPackage(edited, state)).toBeNull()
  })

  it('rejects renamed, resized and restyled decks', () => {
    const state = deck()
    retainSourcePackage('package', new ArrayBuffer(8))
    certifySourcePackageDocument('package', state)
    for (const patch of [{ title: 'Renamed' }, { viewportSize: 1280 }, { viewportRatio: 1 }, { theme: { backgroundColor: '#123456' } }]) {
      expect(tryGetCleanRetainedPackage(state.slides, { ...state, ...patch })).toBeNull()
    }
  })

  it('does not certify over import repairs or reuse a previous import snapshot', () => {
    const state = deck()
    retainSourcePackage('package', new ArrayBuffer(8))
    markSourcePackageDirty()
    certifySourcePackageDocument('package', state)
    expect(tryGetCleanRetainedPackage(state.slides, state)).toBeNull()
    retainSourcePackage('package', new ArrayBuffer(16))
    certifySourcePackageDocument('package', state)
    retainSourcePackage('package', new ArrayBuffer(32))
    expect(tryGetCleanRetainedPackage(state.slides, state)).toBeNull()
  })
})
