import type { BaseTranslation } from '../../i18n-types'

const en_components: BaseTranslation = {
  outlineEditor: {
    flags: {
      topic: 'Topic',
      chapter: 'Ch.',
      section: 'Sec.',
    },
    contextmenu: {
      addChildChapter: 'Add child chapter',
      addSiblingChapterAbove: 'Add chapter above',
      addChildSection: 'Add child section',
      deleteChapter: 'Delete this chapter',
      addSiblingSectionAbove: 'Add section above',
      addChildItem: 'Add child item',
      deleteSection: 'Delete this section',
      addSiblingItemAbove: 'Add item above',
      addSiblingItemBelow: 'Add item below',
      deleteItem: 'Delete this item',
    },
    defaultContent: {
      newChapter: 'New chapter',
      newSection: 'New section',
      newItem: 'New item',
    },
  },
  audioPlayer: {
    loadFailed: 'Audio failed to load',
    synthesizingPoster: 'Creating preview…',
  },
  chartDataEditor: {
    chartTypeLabel: 'Chart type:',
    clickToChange: 'Change',
    clearData: 'Clear data',
    categoryDefault: 'Category {n}',
    seriesDefault: 'Series {n}',
  },
  colorPicker: {
    recentColors: 'Recently used:',
    eyeDropperEscHint: 'Press ESC to close the eyedropper',
    eyeDropperInitFailed: 'Failed to initialize eyedropper',
  },
  latexEditor: {
    title: 'Add formula',
    editTitle: 'Edit formula',
    description: 'Write an equation as you would on paper. It is placed on the slide as a formula.',
    fieldLabel: 'Equation',
    hint: 'Start typing…',
    tipsLabel: 'Shortcuts',
    tipFraction: 'fraction',
    tipPower: 'exponent',
    tipRoot: 'square root',
    keyboardTooltip: 'Math keyboard',
    insert: 'Insert',
    formulaEmpty: 'Type a formula first',
  },
  latexExtractor: {
    title: 'Extract formulas',
    description: 'Paste LaTeX text to extract every equation environment and insert the selected formulas on the current slide.',
    placeholder: 'Example: paste LaTeX with equation environments',
    results: 'Results',
    selectAll: 'Select all',
    selectedCount: 'Selected {selected} / {total}',
    empty: 'No equation environments found',
    insertSelected: 'Insert selected ({count})',
    noneFound: 'No formulas found in equation environments',
    selectAtLeastOne: 'Select at least one formula to insert',
    renderFailed: 'Failed to render formula {index}',
  },
  mermaidEditor: {
    inputPlaceholder: 'Enter Mermaid code',
    previewPlaceholder: 'Diagram preview',
    syntaxError: 'Mermaid syntax error',
    codeEmpty: 'Mermaid code cannot be empty',
    renderFailed: 'Failed to render Mermaid diagram',
  },
  codeEditor: {
    language: 'Language',
    theme: 'Theme',
    fontSize: 'Size',
    lineNumbers: 'Line numbers',
    codeEmpty: 'Type some code first',
    renderFailed: 'Failed to highlight code',
  },
  inlineMathEditor: {
    title: 'Edit formula',
    inputPlaceholder: 'Enter a formula',
    empty: 'Formula cannot be empty',
  },
}

export default en_components
