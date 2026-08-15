import { applyLiveLayoutOntoStore } from './liveLayoutCommit'
import { shouldWriteEditorHtml } from './prosemirror/commitPolicy'
import type { PPTTextElement } from '@/types/slides'

const text = (id: string, content: string, left: number): PPTTextElement => ({
  type: 'text',
  id,
  left,
  top: 0,
  width: 100,
  height: 40,
  rotate: 0,
  content,
  defaultFontName: '',
  defaultColor: '#000',
})

const live = [text('a', '', 80), text('b', 'stale', 10)]
const store = [text('a', '<p>kept</p>', 20), text('b', '<p>store-b</p>', 10)]
const merged = applyLiveLayoutOntoStore(live, store)

if (merged[0].left !== 80) throw new Error('geometry must come from the live list')
if (merged[0].type === 'text' && merged[0].content !== '<p>kept</p>') {
  throw new Error('store content must survive a geometry commit')
}
if (merged[1].type === 'text' && merged[1].content !== '<p>store-b</p>') {
  throw new Error('every text box must keep store content')
}

if (!shouldWriteEditorHtml({ nextHtml: '<p>ghj</p>', storeHtml: '', isAuthoritative: false })) {
  throw new Error('filled live HTML must reach the store even when unfocused')
}
if (shouldWriteEditorHtml({ nextHtml: '', storeHtml: '<p>kept</p>', isAuthoritative: false })) {
  throw new Error('unfocused empty view must not wipe store text')
}
if (!shouldWriteEditorHtml({ nextHtml: '<p>typed</p>', storeHtml: '', isAuthoritative: true })) {
  throw new Error('focused/editing view must persist typed text')
}
if (!shouldWriteEditorHtml({ nextHtml: '', storeHtml: '<p>gone</p>', isAuthoritative: true })) {
  throw new Error('focused/editing view may clear store text')
}
if (shouldWriteEditorHtml({ nextHtml: '<p>same</p>', storeHtml: '<p>same</p>', isAuthoritative: true })) {
  throw new Error('identical HTML must not rewrite')
}
