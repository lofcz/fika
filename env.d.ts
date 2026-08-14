/// <reference types="@rsbuild/core/types" />

declare const __FIKA_EXTRAS_ENABLED__: boolean

declare module '*.svg' {
  const src: string
  export default src
}

