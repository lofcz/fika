import type { CSSProperties } from 'react'

export type CSSPropertiesWithVars = CSSProperties & Record<`--${string}`, string | number | undefined>

declare module 'csstype' {
  interface Properties {
    [key: `--${string}`]: string | number | undefined
  }
}