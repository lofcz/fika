import { getMediaUploader } from '@/configs/mediaUpload'
import { detectMediaKind, validateMediaFile } from '@/utils/mediaFile'
export async function loadPhotoFrameImage(input: string | File) {
  let src: string
  if (typeof input === 'string') src = input
  else {
    if (detectMediaKind(input) !== 'image' || validateMediaFile(input)) throw Error('Invalid image')
    const uploader = getMediaUploader()
    const result = uploader ? await uploader({ file: input, kind: 'image', signal: new AbortController().signal, onProgress: () => {} }) : await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.onabort = reject; reader.readAsDataURL(input)
    })
    src = typeof result === 'string' ? result : result.src
  }
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image(); image.onload = () => image.naturalWidth && image.naturalHeight ? resolve({ width: image.naturalWidth, height: image.naturalHeight }) : reject(Error('Invalid dimensions')); image.onerror = reject; image.src = src
  })
  return { src, ...size }
}
