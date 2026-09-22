const en = {
  title: 'Personal templates', hint: 'Saved only in this browser. Linked online media still needs its original source. Templates exclude comments and speaker notes.',
  name: 'Template name', save: 'Save this design', saving: 'Saving…', search: 'Search personal templates', all: 'Best fit', favorites: 'Favorites', recent: 'Recent',
  empty: 'No matching personal templates. Save a design to reuse its pages.', use: 'Add all pages', rename: 'Rename', remove: 'Delete', confirm: 'Delete template?', cancel: 'Cancel',
  favorite: 'Favorite', unfavorite: 'Remove favorite', saved: 'Design saved as a personal template.', added: 'Template pages added. Undo to remove them.',
  failed: 'Could not save the library. Browser storage may be full or unavailable, or a media file could not be read. Your previous templates are unchanged.',
  unreadable: 'The saved template library could not be read. It has not been overwritten.', pages: 'Pages', fit: 'Pages adapt to the current design size.',
}
export type LibraryMessages = typeof en
const cs: LibraryMessages = {
  title: 'Osobní šablony', hint: 'Uloženo pouze v tomto prohlížeči. Odkazovaná online média nadále vyžadují původní zdroj. Šablony neobsahují komentáře ani poznámky přednášejícího.',
  name: 'Název šablony', save: 'Uložit tento návrh', saving: 'Ukládání…', search: 'Hledat osobní šablony', all: 'Nejlepší shoda', favorites: 'Oblíbené', recent: 'Nedávné',
  empty: 'Žádné odpovídající osobní šablony. Uložte návrh a použijte jeho stránky znovu.', use: 'Přidat všechny stránky', rename: 'Přejmenovat', remove: 'Smazat', confirm: 'Smazat šablonu?', cancel: 'Zrušit',
  favorite: 'Přidat do oblíbených', unfavorite: 'Odebrat z oblíbených', saved: 'Návrh byl uložen jako osobní šablona.', added: 'Stránky šablony byly přidány. Můžete je odebrat pomocí Zpět.',
  failed: 'Knihovnu nelze uložit. Úložiště prohlížeče může být plné či nedostupné nebo nelze načíst médium. Předchozí šablony zůstávají zachovány.',
  unreadable: 'Uloženou knihovnu šablon nelze načíst. Nebyla přepsána.', pages: 'Stránky', fit: 'Stránky se přizpůsobí aktuální velikosti návrhu.',
}
const sk: LibraryMessages = {
  title: 'Osobné šablóny', hint: 'Uložené iba v tomto prehliadači. Prepojené online médiá naďalej vyžadujú pôvodný zdroj. Šablóny neobsahujú komentáre ani poznámky prednášajúceho.',
  name: 'Názov šablóny', save: 'Uložiť tento návrh', saving: 'Ukladanie…', search: 'Hľadať osobné šablóny', all: 'Najlepšia zhoda', favorites: 'Obľúbené', recent: 'Nedávne',
  empty: 'Žiadne zodpovedajúce osobné šablóny. Uložte návrh a použite jeho stránky znova.', use: 'Pridať všetky stránky', rename: 'Premenovať', remove: 'Vymazať', confirm: 'Vymazať šablónu?', cancel: 'Zrušiť',
  favorite: 'Pridať medzi obľúbené', unfavorite: 'Odobrať z obľúbených', saved: 'Návrh bol uložený ako osobná šablóna.', added: 'Stránky šablóny boli pridané. Môžete ich odobrať pomocou Späť.',
  failed: 'Knižnicu nemožno uložiť. Úložisko prehliadača môže byť plné či nedostupné alebo nemožno načítať médium. Predchádzajúce šablóny zostávajú zachované.',
  unreadable: 'Uloženú knižnicu šablón nemožno načítať. Nebola prepísaná.', pages: 'Stránky', fit: 'Stránky sa prispôsobia aktuálnej veľkosti návrhu.',
}
const pl: LibraryMessages = {
  title: 'Szablony osobiste', hint: 'Zapisane tylko w tej przeglądarce. Połączone multimedia online nadal wymagają oryginalnego źródła. Szablony nie zawierają komentarzy ani notatek prelegenta.',
  name: 'Nazwa szablonu', save: 'Zapisz ten projekt', saving: 'Zapisywanie…', search: 'Szukaj szablonów osobistych', all: 'Najlepsze dopasowanie', favorites: 'Ulubione', recent: 'Ostatnie',
  empty: 'Brak pasujących szablonów osobistych. Zapisz projekt, aby ponownie użyć jego stron.', use: 'Dodaj wszystkie strony', rename: 'Zmień nazwę', remove: 'Usuń', confirm: 'Usunąć szablon?', cancel: 'Anuluj',
  favorite: 'Dodaj do ulubionych', unfavorite: 'Usuń z ulubionych', saved: 'Projekt zapisano jako szablon osobisty.', added: 'Dodano strony szablonu. Możesz je usunąć poleceniem Cofnij.',
  failed: 'Nie można zapisać biblioteki. Pamięć przeglądarki może być pełna lub niedostępna albo nie można odczytać multimediów. Poprzednie szablony pozostają bez zmian.',
  unreadable: 'Nie można odczytać zapisanej biblioteki szablonów. Nie została nadpisana.', pages: 'Strony', fit: 'Strony dostosują się do aktualnego rozmiaru projektu.',
}
export const libraryMessages = (locale: string): LibraryMessages => ({ en, cs, sk, pl })[locale.split('-')[0] as 'en'] ?? en
