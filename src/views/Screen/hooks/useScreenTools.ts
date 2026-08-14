import { useEffect, useRef, useState } from 'react'
import type { LaserColorId, ScreenTool } from '@/configs/laser'

/**
 * Exclusive presenter tools. Selecting one deactivates the previous tool.
 * Pen ink stays mounted until the user closes it — switching to laser must
 * not tear down the writing board.
 *
 * Tool / color live in refs. Callbacks always read current values so
 * empty-deps listeners in useExecPlay stay correct.
 */
export const useScreenTools = () => {
  const toolRef = useRef<ScreenTool | null>(null)
  const laserColorRef = useRef<LaserColorId>('red')
  const [tool, setToolState] = useState<ScreenTool | null>(null)
  const [laserColor, setLaserColorState] = useState<LaserColorId>('red')
  const [penSession, setPenSession] = useState(false)

  const switchTool = (next: ScreenTool | null) => {
    toolRef.current = next
    setToolState(next)
  }

  const toggleTool = (next: ScreenTool) => {
    switchTool(toolRef.current === next ? null : next)
  }

  const toggleLaserColor = (color: LaserColorId) => {
    if (laserColorRef.current === color) return
    laserColorRef.current = color
    setLaserColorState(color)
  }

  const closePenSession = () => {
    setPenSession(false)
    if (toolRef.current === 'pen') switchTool(null)
  }

  useEffect(() => {
    if (tool === 'pen') setPenSession(true)
  }, [tool])

  return {
    tool,
    laserColor,
    laserActive: tool === 'laser',
    penActive: tool === 'pen',
    penSession,
    switchTool,
    toggleTool,
    toggleLaserColor,
    closePenSession,
  }
}
