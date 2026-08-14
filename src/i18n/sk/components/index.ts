import type { NamespaceComponentsTranslation } from '../../i18n-types'

const sk_components: NamespaceComponentsTranslation = {
  outlineEditor: {
    flags: {
      topic: 'Téma',
      chapter: 'Kap.',
      section: 'Odd.',
    },
    contextmenu: {
      addChildChapter: 'Pridať podradenú kapitolu',
      addSiblingChapterAbove: 'Pridať kapitolu nad',
      addChildSection: 'Pridať podradený oddiel',
      deleteChapter: 'Odstrániť túto kapitolu',
      addSiblingSectionAbove: 'Pridať oddiel nad',
      addChildItem: 'Pridať podradenú položku',
      deleteSection: 'Odstrániť tento oddiel',
      addSiblingItemAbove: 'Pridať položku nad',
      addSiblingItemBelow: 'Pridať položku pod',
      deleteItem: 'Odstrániť túto položku',
    },
    defaultContent: {
      newChapter: 'Nová kapitola',
      newSection: 'Nový oddiel',
      newItem: 'Nová položka',
    },
  },
  audioPlayer: {
    loadFailed: 'Audio sa nepodarilo načítať',
    synthesizingPoster: 'Vytváram náhľad…',
  },
  chartDataEditor: {
    chartTypeLabel: 'Typ grafu:',
    clickToChange: 'Zmeniť',
    clearData: 'Vymazať údaje',
    categoryDefault: 'Kategória {n}',
    seriesDefault: 'Rad {n}',
  },
  colorPicker: {
    recentColors: 'Naposledy použité:',
    eyeDropperEscHint: 'Ukončite výber farby klávesou ESC',
    eyeDropperInitFailed: 'Výber farby sa nepodarilo spustiť',
  },
  latexEditor: {
    title: 'Pridať vzorec',
    editTitle: 'Upraviť vzorec',
    description: 'Napíšte rovnicu tak, ako by ste ju písali na papier. Na snímku sa vloží ako vzorec.',
    fieldLabel: 'Rovnica',
    hint: 'Začnite písať…',
    tipsLabel: 'Skratky',
    tipFraction: 'zlomok',
    tipPower: 'mocnina',
    tipRoot: 'odmocnina',
    keyboardTooltip: 'Matematická klávesnica',
    insert: 'Vložiť',
    formulaEmpty: 'Najprv zadajte vzorec',
  },
  latexExtractor: {
    title: 'Extrahovať vzorce',
    description:
      'Vložte text LaTeXu na extrakciu všetkých prostredí equation a vloženie vybraných vzorcov na aktuálnu snímku.',
    placeholder: 'Príklad: vložte LaTeX s prostrediami equation',
    results: 'Výsledky',
    selectAll: 'Vybrať všetko',
    selectedCount: 'Vybrané {selected} / {total}',
    empty: 'Nenašli sa žiadne equation prostredia',
    insertSelected: 'Vložiť vybrané ({count})',
    noneFound: 'V prostrediach equation sa nenašli žiadne vzorce',
    selectAtLeastOne: 'Vyberte aspoň jeden vzorec na vloženie',
    renderFailed: 'Nepodarilo sa vykresliť vzorec {index}',
  },
  mermaidEditor: {
    inputPlaceholder: 'Zadajte kód Mermaid',
    previewPlaceholder: 'Náhľad diagramu',
    syntaxError: 'Chyba syntaxe Mermaid',
    codeEmpty: 'Kód Mermaid nesmie byť prázdny',
    renderFailed: 'Nepodarilo sa vykresliť diagram Mermaid',
  },
  codeEditor: {
    language: 'Jazyk',
    theme: 'Motív',
    fontSize: 'Veľkosť',
    lineNumbers: 'Čísla riadkov',
    codeEmpty: 'Najprv napíšte kód',
    renderFailed: 'Kód sa nepodarilo zvýrazniť',
  },
  inlineMathEditor: {
    title: 'Upraviť vzorec',
    inputPlaceholder: 'Zadajte vzorec',
    empty: 'Vzorec nesmie byť prázdny',
  },
}

export default sk_components
