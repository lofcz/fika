import type { BaseTranslation } from '../../i18n-types'

const en_common: BaseTranslation = {
  loadingData: 'Just a moment',
  loading: 'Loading...',
  error: 'Error',
  cancel: 'Cancel',
  confirm: 'Confirm',
  save: 'Save',
  delete: 'Delete',
  copy: 'Copy',
  edit: 'Edit',
  close: 'Close',
  back: 'Back',
  continue: 'Continue',
  refresh: 'Refresh',
  search: 'Search',
  reset: 'Reset',
  apply: 'Apply',
  ok: 'OK',
  yes: 'Yes',
  no: 'No',
  fileParseError: 'Unable to read or parse this file',
  network: {
    unknownRequestError: 'Unknown request error!',
    serverUnknownError: 'The server encountered an unknown error!',
    connectionFailedOrTimeout:
      'Failed to connect to the server or the server response timed out!',
    nonStreamResponse: 'The server returned a non-stream response',
  },
  clipboard: {
    emptyOrNoText: 'Clipboard is empty or does not contain text',
    unsupportedOrDenied:
      'Your browser does not support or blocks clipboard access. Please paste with Ctrl + V',
  },
}

export default en_common
