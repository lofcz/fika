import { useState, useEffect, useRef } from 'react'
import { isFullscreen, exitFullscreen } from '@/utils/fullscreen'
import useScreening from '@/hooks/useScreening'

export default () => {
  const [fullscreenState, setFullscreenState] = useState(true)
  const fullscreenStateRef = useRef(true)
  const escExitRef = useRef(true)
  const { exitScreening } = useScreening()
  const exitScreeningRef = useRef(exitScreening)
  exitScreeningRef.current = exitScreening

  useEffect(() => {
    const syncFullscreen = () => {
      const next = isFullscreen()
      fullscreenStateRef.current = next
      setFullscreenState(next)
    }
    const handleFullscreenChange = () => {
      syncFullscreen()
      if (!fullscreenStateRef.current && escExitRef.current) exitScreeningRef.current()
      escExitRef.current = true
    }
    syncFullscreen()
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  const manualExitFullscreen = () => {
    if (!fullscreenStateRef.current) return
    escExitRef.current = false
    exitFullscreen()
  }

  return {
    fullscreenState,
    manualExitFullscreen,
  }
}
