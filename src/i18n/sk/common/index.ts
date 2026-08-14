import type { NamespaceCommonTranslation } from '../../i18n-types'

const sk_common: NamespaceCommonTranslation = {
  loadingData: 'Chvíľku strpenia',
  loading: 'Načítava sa...',
  error: 'Chyba',
  cancel: 'Zrušiť',
  confirm: 'Potvrdiť',
  save: 'Uložiť',
  delete: 'Odstrániť',
  copy: 'Kopírovať',
  edit: 'Upraviť',
  close: 'Zavrieť',
  back: 'Späť',
  continue: 'Pokračovať',
  refresh: 'Obnoviť',
  search: 'Hľadať',
  reset: 'Resetovať',
  apply: 'Použiť',
  ok: 'OK',
  yes: 'Áno',
  no: 'Nie',
  fileParseError: 'Súbor nie je možné správne načítať ani spracovať.',
  network: {
    unknownRequestError: 'Neznáma chyba požiadavky!',
    serverUnknownError: 'Server narazil na neznámu chybu!',
    connectionFailedOrTimeout:
      'Nepodarilo sa pripojiť k serveru alebo vypršal časový limit odpovede servera!',
    nonStreamResponse: 'Server vrátil nestreamovú odpoveď',
  },
  clipboard: {
    emptyOrNoText: 'Schránka neobsahuje žiadny text',
    unsupportedOrDenied:
      'Prehliadač nepodporuje prístup ku schránke alebo ho blokuje. Vložte obsah pomocou Ctrl + V',
  },
}

export default sk_common
