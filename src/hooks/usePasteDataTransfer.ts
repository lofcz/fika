import message from '@/utils/message'
import { getLL } from '@/i18n/getLL'
import { MIME_MAP } from '@/configs/mime'
import { getImageDataURL } from '@/utils/image'
import { registerMediaBlob } from '@/utils/mediaIntern'
import useCreateElement from './useCreateElement'

export default () => {
  const { createImageElement, createVideoElement, createAudioElement } = useCreateElement()

  const pasteDataTransfer = (dataTransfer: DataTransfer) => {
    const dataItems = dataTransfer.items
    const dataTransferFirstItem = dataItems[0]

    let isFile = false

    for (const item of dataItems) {
      if (item.kind === 'file') {
        if (item.type.indexOf('image') !== -1) {
          const imageFile = item.getAsFile()
          if (imageFile) {
            getImageDataURL(imageFile).then(dataURL => createImageElement(dataURL)).catch(() => message.error(getLL().common.fileParseError()))
            isFile = true
          }
        }
        else if (item.type.indexOf('video') !== -1) {
          const videoFile = item.getAsFile()
          if (videoFile) {
            const videoURL = URL.createObjectURL(videoFile)
            registerMediaBlob(videoURL, videoFile)
            const ext = MIME_MAP[videoFile.type] || ''
            createVideoElement(videoURL, ext)
            isFile = true
          }
        }
        else if (item.type.indexOf('audio') !== -1) {
          const audioFile = item.getAsFile()
          if (audioFile) {
            const audioURL = URL.createObjectURL(audioFile)
            registerMediaBlob(audioURL, audioFile)
            const ext = MIME_MAP[audioFile.type] || ''
            createAudioElement(audioURL, ext)
            isFile = true
          }
        }
      }
    }

    if (!isFile && dataTransferFirstItem && dataTransferFirstItem.kind === 'file') {
      if (!isFile && dataTransferFirstItem.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        const pptxFile = dataTransferFirstItem.getAsFile()
        if (pptxFile) {
          void import('./useImport')
            .then(({ getImportApi }) => getImportApi().importPPTXFile([pptxFile]))
            .catch(error => {
              console.error('[fika] failed to load import module', error)
              message.error(getLL().editor.import.failed())
            })
          isFile = true
        }
      }
      else if (!isFile) {
        const unknownFile = dataTransferFirstItem.getAsFile()

        if (unknownFile && unknownFile.name) {
          const ext = unknownFile.name.split('.').pop() || ''

          if (ext === 'fika') {
            void import('./useImport')
              .then(({ getImportApi }) => getImportApi().importSpecificFile([unknownFile]))
              .catch(error => {
                console.error('[fika] failed to load import module', error)
                message.error(getLL().editor.import.failed())
              })
            isFile = true
          }
        }
      }
    }

    return { isFile, dataTransferFirstItem }
  }

  return {
    pasteDataTransfer,
  }
}
