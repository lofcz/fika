/** Myna inspector copy kept independent from generated dictionaries. */
const en = {
  page: 'Page settings', selection: 'Selection', selected: 'Selected elements',
  appearance: 'Appearance', typography: 'Typography and effects', image: 'Crop, filters and effects',
  geometry: 'Position and size', arrange: 'Align, distribute and arrange',
  motion: 'Animation', transition: 'Page transition', design: 'Background and design',
  pageHint: 'Select an element to edit its properties.',
  multiHint: 'Style and arrange the selected elements together.',
  readOnly: 'This design is read only.',
  text: 'Text', shape: 'Shape', line: 'Line', chart: 'Chart', table: 'Table',
  latex: 'Formula', code: 'Code', video: 'Video', audio: 'Audio', photo: 'Image',
}
type Labels = Record<keyof typeof en, string>
const cs: Labels = {
  page: 'Nastavení stránky', selection: 'Výběr', selected: 'Vybrané prvky',
  appearance: 'Vzhled', typography: 'Typografie a efekty', image: 'Ořez, filtry a efekty',
  geometry: 'Poloha a velikost', arrange: 'Zarovnání, rozmístění a pořadí',
  motion: 'Animace', transition: 'Přechod stránky', design: 'Pozadí a návrh',
  pageHint: 'Vyberte prvek a upravte jeho vlastnosti.',
  multiHint: 'Upravte vzhled a rozmístění vybraných prvků společně.',
  readOnly: 'Tento návrh je pouze pro čtení.',
  text: 'Text', shape: 'Tvar', line: 'Čára', chart: 'Graf', table: 'Tabulka',
  latex: 'Vzorec', code: 'Kód', video: 'Video', audio: 'Zvuk', photo: 'Obrázek',
}
const sk: Labels = {
  page: 'Nastavenia stránky', selection: 'Výber', selected: 'Vybrané prvky',
  appearance: 'Vzhľad', typography: 'Typografia a efekty', image: 'Orezanie, filtre a efekty',
  geometry: 'Poloha a veľkosť', arrange: 'Zarovnanie, rozmiestnenie a poradie',
  motion: 'Animácia', transition: 'Prechod stránky', design: 'Pozadie a návrh',
  pageHint: 'Vyberte prvok a upravte jeho vlastnosti.',
  multiHint: 'Upravte vzhľad a rozmiestnenie vybraných prvkov spoločne.',
  readOnly: 'Tento návrh je iba na čítanie.',
  text: 'Text', shape: 'Tvar', line: 'Čiara', chart: 'Graf', table: 'Tabuľka',
  latex: 'Vzorec', code: 'Kód', video: 'Video', audio: 'Zvuk', photo: 'Obrázok',
}
const pl: Labels = {
  page: 'Ustawienia strony', selection: 'Zaznaczenie', selected: 'Zaznaczone elementy',
  appearance: 'Wygląd', typography: 'Typografia i efekty', image: 'Kadrowanie, filtry i efekty',
  geometry: 'Pozycja i rozmiar', arrange: 'Wyrównanie, rozmieszczenie i kolejność',
  motion: 'Animacja', transition: 'Przejście strony', design: 'Tło i projekt',
  pageHint: 'Wybierz element, aby edytować jego właściwości.',
  multiHint: 'Zmień wygląd i rozmieszczenie zaznaczonych elementów razem.',
  readOnly: 'Ten projekt jest tylko do odczytu.',
  text: 'Tekst', shape: 'Kształt', line: 'Linia', chart: 'Wykres', table: 'Tabela',
  latex: 'Wzór', code: 'Kod', video: 'Wideo', audio: 'Dźwięk', photo: 'Obraz',
}
export const inspectorLabels = (locale: string): Labels => ({ en, cs, sk, pl }[locale] ?? en)
