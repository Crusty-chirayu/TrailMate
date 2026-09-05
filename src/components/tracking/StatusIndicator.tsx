import type { TrackingStatus, SyncState } from '@/types/tracking'
import { cn } from '@/lib/utils'
import { formatAccuracy } from '@/lib/tracking/format'

interface StatusIndicatorProps {
  status: TrackingStatus
  syncState: SyncState
  online: boolean
  accuracy?: number
  pointCount?: number
  className?: string
}

const STATUS_LABEL: Record<TrackingStatus, string> = {
  idle: 'Ready',
  acquiring: 'Acquiring GPS…',
  tracking: 'Recording',
  paused: 'Paused',
  stopping: 'Finishing…',
  completed: 'Complete',
  error: 'GPS error',
  denied: 'GPS permission denied',
  unavailable: 'GPS unavailable',
}

function syncLabel(sync: SyncState, online: boolean): string {
  if (!online) return 'Offline — saving locally'
  switch (sync) {
    case 'local':
      return 'Not synced yet'
    case 'pending':
      return 'Waiting to sync'
    case 'syncing':
      return 'Syncing…'
    case 'failed':
      return 'Sync retrying…'
    case 'synced':
      return 'Saved'
  }
}

export default function StatusIndicator({
  status,
  syncState,
  online,
  accuracy,
  pointCount,
  className,
}: StatusIndicatorProps) {
  const recording = status === 'tracking'
  const signalGood = status === 'tracking' || status === 'paused'

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-sm', className)}>
      {/* Recording / GPS status */}
      <div className="flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {recording && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          )}
          <span
            className={cn(
              'relative inline-flex h-2.5 w-2.5 rounded-full',
              recording ? 'bg-emerald-400' : signalGood ? 'bg-amber-400' : 'bg-slate-500',
            )}
          />
        </span>
        <span className="font-medium">{STATUS_LABEL[status]}</span>
        {accuracy !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">{formatAccuracy(accuracy)}</span>
        )}
      </div>

      {/* Point count */}
      {typeof pointCount === 'number' && pointCount > 0 && (
        <span className="font-mono text-xs text-muted-foreground">{pointCount} points</span>
      )}

      {/* Sync / offline state */}
      <span
        className={cn(
          'text-xs',
          !online || syncState === 'failed' ? 'text-amber-400' : syncState === 'syncing' ? 'text-sky-400' : 'text-muted-foreground',
        )}
      >
        {syncLabel(syncState, online)}
      </span>
    </div>
  )
}