import { useState, useEffect } from 'react'
import { mediaPlayerHostId } from '@/utils/mediaLayout'
import { queryFika } from '@/utils/portal'

export default (elementId: () => string, isSelected: boolean) => {
  const [hostEl, setHostEl] = useState<HTMLElement | null>(null)
  const resolveHost = () => {
    const el = queryFika(`#${mediaPlayerHostId(elementId())}`)
    setHostEl(el instanceof HTMLElement ? el : null)
  }
  useEffect(() => {
    void Promise.resolve().then(resolveHost)
  }, [])
  useEffect(() => {
    void Promise.resolve().then(resolveHost)
  }, [elementId, isSelected])
  return {
    teleportTo: hostEl || `#${mediaPlayerHostId(elementId())}`,
    teleportDisabled: !isSelected || !hostEl,
  }
}
