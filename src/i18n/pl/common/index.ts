import type { NamespaceCommonTranslation } from '../../i18n-types'

const pl_common: NamespaceCommonTranslation = {
  loadingData: 'Chwileczkę',
  loading: 'Ładowanie...',
  error: 'Błąd',
  cancel: 'Anuluj',
  confirm: 'Potwierdź',
  save: 'Zapisz',
  delete: 'Usuń',
  copy: 'Kopiuj',
  edit: 'Edytuj',
  close: 'Zamknij',
  back: 'Wstecz',
  continue: 'Kontynuuj',
  refresh: 'Odśwież',
  search: 'Szukaj',
  reset: 'Resetuj',
  apply: 'Zastosuj',
  ok: 'OK',
  yes: 'Tak',
  no: 'Nie',
  fileParseError: 'Nie można poprawnie odczytać ani przeanalizować tego pliku.',
  network: {
    unknownRequestError: 'Nieznany błąd żądania!',
    serverUnknownError: 'Serwer napotkał nieznany błąd!',
    connectionFailedOrTimeout:
      'Nie udało się połączyć z serwerem lub upłynął limit czasu odpowiedzi serwera!',
    nonStreamResponse: 'Serwer zwrócił odpowiedź inną niż strumień',
  },
  clipboard: {
    emptyOrNoText: 'Schowek jest pusty lub nie zawiera tekstu',
    unsupportedOrDenied:
      'Przeglądarka nie obsługuje schowka lub odmawia dostępu. Wklej zawartość skrótem Ctrl + V',
  },
}

export default pl_common
