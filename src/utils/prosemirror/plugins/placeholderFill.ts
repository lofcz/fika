import { Plugin } from 'prosemirror-state'
import type { PlaceholderStyleOptions } from '@/utils/prosemirror/commands/applyPlaceholderStyles'
import { paintFilledPlaceholderTr } from '@/utils/prosemirror/commands/applyPlaceholderStyles'

export const placeholderFillPlugin = (getOptions: () => PlaceholderStyleOptions | null) => (
  new Plugin({
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some(tr => tr.docChanged)) return null
      if (oldState.doc.textContent.trim().length > 0) return null
      if (newState.doc.textContent.trim().length === 0) return null
      const options = getOptions()
      if (!options) return null
      return paintFilledPlaceholderTr(newState.tr, newState.schema, options)
    },
  })
)
