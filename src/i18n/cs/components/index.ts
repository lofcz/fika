import type { NamespaceComponentsTranslation } from '../../i18n-types'

const cs_components: NamespaceComponentsTranslation = {
  outlineEditor: {
    flags: {
      topic: 'Téma',
      chapter: 'Kap.',
      section: 'Odd.',
    },
    contextmenu: {
      addChildChapter: 'Přidat podřazenou kapitolu',
      addSiblingChapterAbove: 'Přidat kapitolu nad',
      addChildSection: 'Přidat podřazený oddíl',
      deleteChapter: 'Smazat tuto kapitolu',
      addSiblingSectionAbove: 'Přidat oddíl nad',
      addChildItem: 'Přidat podřazenou položku',
      deleteSection: 'Smazat tento oddíl',
      addSiblingItemAbove: 'Přidat položku nad',
      addSiblingItemBelow: 'Přidat položku pod',
      deleteItem: 'Smazat tuto položku',
    },
    defaultContent: {
      newChapter: 'Nová kapitola',
      newSection: 'Nový oddíl',
      newItem: 'Nová položka',
    },
  },
  audioPlayer: {
    loadFailed: 'Audio se nepodařilo načíst',
    synthesizingPoster: 'Vytvářím náhled…',
  },
  chartDataEditor: {
    chartTypeLabel: 'Typ grafu:',
    clickToChange: 'Změnit',
    clearData: 'Vymazat data',
    categoryDefault: 'Kategorie {n}',
    seriesDefault: 'Řada {n}',
  },
  colorPicker: {
    recentColors: 'Naposledy použité:',
    eyeDropperEscHint: 'Ukončete výběr barvy klávesou ESC',
    eyeDropperInitFailed: 'Výběr barvy se nepodařilo spustit',
  },
  latexEditor: {
    title: 'Přidat vzorec',
    editTitle: 'Upravit vzorec',
    description: 'Napište rovnici tak, jak byste ji psali na papír. Na snímek se vloží jako vzorec.',
    fieldLabel: 'Rovnice',
    hint: 'Začněte psát…',
    tipsLabel: 'Zkratky',
    tipFraction: 'zlomek',
    tipPower: 'mocnina',
    tipRoot: 'odmocnina',
    keyboardTooltip: 'Matematická klávesnice',
    insert: 'Vložit',
    formulaEmpty: 'Nejprve zadejte vzorec',
  },
  latexExtractor: {
    title: 'Extrahovat vzorce',
    description:
      'Vložte text LaTeXu pro extrakci všech prostředí equation a vložení vybraných vzorců na aktuální snímek.',
    placeholder: 'Příklad: vložte LaTeX s prostředími equation',
    results: 'Výsledky',
    selectAll: 'Vybrat vše',
    selectedCount: 'Vybráno {selected} / {total}',
    empty: 'Nebyly nalezeny žádné equation prostředí',
    insertSelected: 'Vložit vybrané ({count})',
    noneFound: 'V prostředích equation nebyly nalezeny žádné vzorce',
    selectAtLeastOne: 'Vyberte alespoň jeden vzorec k vložení',
    renderFailed: 'Nepodařilo se vykreslit vzorec {index}',
  },
  mermaidEditor: {
    inputPlaceholder: 'Zadejte kód Mermaid',
    previewPlaceholder: 'Náhled diagramu',
    syntaxError: 'Chyba syntaxe Mermaid',
    codeEmpty: 'Kód Mermaid nesmí být prázdný',
    renderFailed: 'Nepodařilo se vykreslit diagram Mermaid',
  },
  codeEditor: {
    language: 'Jazyk',
    theme: 'Motiv',
    fontSize: 'Velikost',
    lineNumbers: 'Čísla řádků',
    codeEmpty: 'Nejdřív napište kód',
    renderFailed: 'Kód se nepodařilo zvýraznit',
  },
  inlineMathEditor: {
    title: 'Upravit vzorec',
    inputPlaceholder: 'Zadejte vzorec',
    empty: 'Vzorec nesmí být prázdný',
  },
}

export default cs_components
