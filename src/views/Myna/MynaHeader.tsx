import type { ReactNode } from 'react'
import EditorHeader from '../Editor/EditorHeader'

/** A single document bar with the editor's existing file and language controls. */
export default function MynaHeader({ children }: { children?: ReactNode }) {
  return <EditorHeader myna>{children}</EditorHeader>
}
