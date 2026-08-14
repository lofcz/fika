import type { NamespaceComponentsTranslation } from '../../i18n-types'

const pl_components: NamespaceComponentsTranslation = {
  outlineEditor: {
    flags: {
      topic: 'Temat',
      chapter: 'Rozdz.',
      section: 'Sekc.',
    },
    contextmenu: {
      addChildChapter: 'Dodaj podrozdział',
      addSiblingChapterAbove: 'Dodaj rozdział powyżej',
      addChildSection: 'Dodaj podsekcję',
      deleteChapter: 'Usuń ten rozdział',
      addSiblingSectionAbove: 'Dodaj sekcję powyżej',
      addChildItem: 'Dodaj podpunkt',
      deleteSection: 'Usuń tę sekcję',
      addSiblingItemAbove: 'Dodaj punkt powyżej',
      addSiblingItemBelow: 'Dodaj punkt poniżej',
      deleteItem: 'Usuń ten punkt',
    },
    defaultContent: {
      newChapter: 'Nowy rozdział',
      newSection: 'Nowa sekcja',
      newItem: 'Nowy punkt',
    },
  },
  audioPlayer: {
    loadFailed: 'Nie udało się wczytać dźwięku',
    synthesizingPoster: 'Tworzenie podglądu…',
  },
  chartDataEditor: {
    chartTypeLabel: 'Typ wykresu:',
    clickToChange: 'Kliknij, aby zmienić',
    clearData: 'Wyczyść dane',
    categoryDefault: 'Kategoria {n}',
    seriesDefault: 'Seria {n}',
  },
  colorPicker: {
    recentColors: 'Ostatnio używane:',
    eyeDropperEscHint: 'Naciśnij ESC, aby zamknąć pipetę',
    eyeDropperInitFailed: 'Nie udało się zainicjować pipety',
  },
  latexEditor: {
    title: 'Dodaj wzór',
    editTitle: 'Edytuj wzór',
    description: 'Zapisz równanie tak, jak na papierze. Zostanie umieszczone na slajdzie jako wzór.',
    fieldLabel: 'Równanie',
    hint: 'Zacznij pisać…',
    tipsLabel: 'Skróty',
    tipFraction: 'ułamek',
    tipPower: 'potęga',
    tipRoot: 'pierwiastek',
    keyboardTooltip: 'Klawiatura matematyczna',
    insert: 'Wstaw',
    formulaEmpty: 'Najpierw wpisz wzór',
  },
  latexExtractor: {
    title: 'Wyodrębnij wzory',
    description:
      'Wklej tekst LaTeX, aby wyodrębnić wszystkie środowiska equation i wstawić wybrane wzory na bieżący slajd.',
    placeholder: 'Przykład: wklej LaTeX ze środowiskami equation',
    results: 'Wyniki',
    selectAll: 'Zaznacz wszystko',
    selectedCount: 'Zaznaczono {selected} / {total}',
    empty: 'Nie znaleziono środowisk equation',
    insertSelected: 'Wstaw zaznaczone ({count})',
    noneFound: 'Nie znaleziono wzorów w środowiskach equation',
    selectAtLeastOne: 'Zaznacz co najmniej jeden wzór do wstawienia',
    renderFailed: 'Nie udało się wyrenderować wzoru {index}',
  },
  mermaidEditor: {
    inputPlaceholder: 'Wpisz kod Mermaid',
    previewPlaceholder: 'Podgląd diagramu',
    syntaxError: 'Błąd składni Mermaid',
    codeEmpty: 'Kod Mermaid nie może być pusty',
    renderFailed: 'Nie udało się wyrenderować diagramu Mermaid',
  },
  codeEditor: {
    language: 'Język',
    theme: 'Motyw',
    fontSize: 'Rozmiar',
    lineNumbers: 'Numery wierszy',
    codeEmpty: 'Najpierw wpisz kod',
    renderFailed: 'Nie udało się podświetlić kodu',
  },
  inlineMathEditor: {
    title: 'Edytuj wzór',
    inputPlaceholder: 'Wpisz wzór',
    empty: 'Wzór nie może być pusty',
  },
}

export default pl_components
