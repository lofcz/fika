import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const FIXTURES_DIR = here
export const ROOT = join(here, '../..')
export const HOUBY_PPTX = join(here, 'pptx/houby.pptx')
export const RIZIKA_PPTX = join(here, 'pptx/rizika.pptx')
export const SB1_PPTX = join(here, 'pptx-import/sb1.pptx')
export const PLEX_FONT = join(here, 'fonts/IBMPlexSans-Regular.ttf')
