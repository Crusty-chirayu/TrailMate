'use client'

import { Button } from '@/components/ui/Button'
import { Play, Pause, Square, RotateCcw } from 'lucide-react'

interface TrackingControlsProps {
  canStart: boolean
  canRetry: boolean
  canPause: boolean
  canResume: boolean
  canFinish: boolean
  isRecording: boolean
  onStart: () => void
  onRetry: () => void
  onPause: () => void
  onResume: () => void
  onFinish: () => void
}

export default function TrackingControls({
  canStart,
  canRetry,
  canPause,
  canResume,
  canFinish,
  isRecording,
  onStart,
  onRetry,
  onPause,
  onResume,
  onFinish,
}: TrackingControlsProps) {
  return (
    <div className="flex items-center gap-3">
      {canRetry && (
        <Button onClick={onRetry} size="lg" className="flex-1 sm:flex-none">
          <RotateCcw className="mr-2 h-5 w-5" aria-hidden />
          Retry GPS
        </Button>
      )}
      {canStart && (
        <Button onClick={onStart} size="lg" className="flex-1 sm:flex-none">
          <Play className="mr-2 h-5 w-5" aria-hidden />
          Start
        </Button>
      )}
      {canPause && (
        <Button onClick={onPause} variant="secondary" size="lg" className="flex-1 sm:flex-none">
          <Pause className="mr-2 h-5 w-5" aria-hidden />
          Pause
        </Button>
      )}
      {canResume && (
        <Button onClick={onResume} size="lg" className="flex-1 sm:flex-none">
          <RotateCcw className="mr-2 h-5 w-5" aria-hidden />
          Resume
        </Button>
      )}
      {canFinish && (
        <Button onClick={onFinish} variant="destructive" size="lg" className="flex-1 sm:flex-none">
          <Square className="mr-2 h-5 w-5" aria-hidden />
          Finish
        </Button>
      )}
      {!canStart && !canRetry && !canPause && !canResume && !canFinish && isRecording && (
        <span className="text-sm text-muted-foreground">Finalizing…</span>
      )}
    </div>
  )
}