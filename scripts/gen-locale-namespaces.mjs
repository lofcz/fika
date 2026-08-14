import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const namespaces = ['editor', 'canvas', 'screen', 'mobile', 'export', 'configs', 'components']
const locales = ['en', 'cs', 'sk', 'pl']
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

for (const loc of locales) {
  const rootDir = join('src/i18n', loc)
  mkdirSync(rootDir, { recursive: true })

  if (loc === 'en') {
    writeFileSync(
      join(rootDir, 'index.ts'),
      `import type { BaseTranslation } from '../i18n-types'\n\nconst en: BaseTranslation = {}\n\nexport default en\n`,
    )
  }
  else {
    writeFileSync(
      join(rootDir, 'index.ts'),
      `import type { Translation } from '../i18n-types'\n\nconst ${loc}: Translation = {}\n\nexport default ${loc}\n`,
    )
  }

  for (const ns of namespaces) {
    const dir = join(rootDir, ns)
    mkdirSync(dir, { recursive: true })

    if (loc === 'en') {
      writeFileSync(
        join(dir, 'index.ts'),
        `import type { BaseTranslation } from '../../i18n-types'\n\nconst en_${ns}: BaseTranslation = {}\n\nexport default en_${ns}\n`,
      )
    }
    else {
      const type = `Namespace${cap(ns)}Translation`
      writeFileSync(
        join(dir, 'index.ts'),
        `import type { ${type} } from '../../i18n-types'\n\nconst ${loc}_${ns}: ${type} = {}\n\nexport default ${loc}_${ns}\n`,
      )
    }
  }
}

const commonTranslations = {
  cs: {
    loadingData: 'Načítání dat, chvíli strpení...',
    loading: 'Načítání...',
    error: 'Chyba',
    cancel: 'Zrušit',
    confirm: 'Potvrdit',
    save: 'Uložit',
    delete: 'Smazat',
    edit: 'Upravit',
    close: 'Zavřít',
    back: 'Zpět',
    continue: 'Pokračovat',
    refresh: 'Obnovit',
    search: 'Hledat',
    reset: 'Resetovat',
    apply: 'Použít',
    ok: 'OK',
    yes: 'Ano',
    no: 'Ne',
  },
  sk: {
    loadingData: 'Načítavanie údajov, chvíľu strpenie...',
    loading: 'Načítava sa...',
    error: 'Chyba',
    cancel: 'Zrušiť',
    confirm: 'Potvrdiť',
    save: 'Uložiť',
    delete: 'Odstrániť',
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
  },
  pl: {
    loadingData: 'Inicjalizacja danych, proszę czekać...',
    loading: 'Ładowanie...',
    error: 'Błąd',
    cancel: 'Anuluj',
    confirm: 'Potwierdź',
    save: 'Zapisz',
    delete: 'Usuń',
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
  },
} 

for (const [loc, keys] of Object.entries(commonTranslations)) {
  const lines = Object.entries(keys)
    .map(([k, v]) => `  ${k}: '${v.replace(/'/g, "\\'")}',`)
    .join('\n')
  writeFileSync(
    join('src/i18n', loc, 'common/index.ts'),
    `import type { NamespaceCommonTranslation } from '../../i18n-types'\n\nconst ${loc}_common: NamespaceCommonTranslation = {\n${lines}\n}\n\nexport default ${loc}_common\n`,
  )
}

console.log('Locale namespace files created')
