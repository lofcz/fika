import pptxgen from 'pptxgenjs-plus'
export interface PptxExportCommand { target: number; property: string; args?: unknown[]; value?: unknown; slide?: number }
/** Record the public generator API, avoiding private class serialization across workers. */
export function recordPptxExport() {
  const commands: PptxExportCommand[] = []
  let slides = 0
  const proxy = (target: number, base: object): any => new Proxy(base, {
    get(object, key) {
      if (typeof key !== 'string') return Reflect.get(object, key)
      if (target === -1 && key === 'addSlide') return (...args: unknown[]) => {
        const slide = slides++
        commands.push({ target, property: key, args: structuredClone(args), slide })
        return proxy(slide, {})
      }
      const value = Reflect.get(object, key)
      if (typeof value === 'function' || target !== -1) return (...args: unknown[]) => {
        commands.push({ target, property: key, args: structuredClone(args) })
      }
      return value
    },
    set(_object, key, value) {
      commands.push({ target, property: String(key), value: structuredClone(value) })
      return true
    },
  })
  return { pptx: proxy(-1, new pptxgen()) as pptxgen, commands }
}
