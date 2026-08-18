import { MIME_MAP } from '@/configs/mime'
import { getImageDataURL } from '@/utils/image'
import { registerMediaBlob } from '@/utils/mediaIntern'
import useCreateElement from './useCreateElement'
import useImport from './useImport'

export default () => {
  const { createImageElement, createVideoElement, createAudioElement } = useCreateElement()
  const { importSpecificFile, importPPTXFile } = useImport()

  const pasteDataTransfer = (dataTransfer: DataTransfer) => {
    const dataItems = dataTransfer.items
    const dataTransferFirstItem = dataItems[0]

    let isFile = false

    for (const item of dataItems) {
      if (item.kind === 'file') {
        if (item.type.indexOf('image') !== -1) {
          const imageFile = item.getAsFile()
          if (imageFile) {
            getImageDataURL(imageFile).then(dataURL => createImageElement(dataURL))
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
          importPPTXFile([pptxFile])
          isFile = true
        }
      }
      else if (!isFile) {
        const unknownFile = dataTransferFirstItem.getAsFile()

        if (unknownFile && unknownFile.name) {
          const ext = unknownFile.name.split('.').pop() || ''

          if (ext === 'fika') {
            importSpecificFile([unknownFile])
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
