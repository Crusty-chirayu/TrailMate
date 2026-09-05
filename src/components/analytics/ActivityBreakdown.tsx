// Per-activity breakdown for the current window (server component).
// Dense table, no cards: only activity types that actually have trips are
// passed in, so there are no empty rows to scan.

import type { ActivitySummary } from '@/lib/domain/tracking/analytics'
import { formatDistance, formatElevation } from '@/lib/tracking/format'

const ACTIVITY_LABELS: Record<string, string> = {
  trekking: 'Trekking',
  cycling: 'Cycling',
  camping: 'Camping',
  other: 'Other',
}

export default function ActivityBreakdown({ summaries }: { summaries: ActivitySummary[] }) {
  if (summaries.length === 0) return null

  return (
    <table className="w-full text-sm">
      <caption className="sr-only">
        Activity breakdown: trips, recorded distance and ascent per activity type
      </caption>
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="py-2 pr-2 font-medium">Activity</th>
          <th scope="col" className="py-2 px-2 font-medium text-right">Trips</th>
          <th scope="col" className="py-2 px-2 font-medium text-right">Distance</th>
          <th scope="col" className="py-2 pl-2 font-medium text-right">Ascent</th>
        </tr>
      </thead>
      <tbody>
        {summaries.map(s => (
          <tr key={s.activityType} className="border-b border-border/50 last:border-0">
            <th scope="row" className="py-2.5 pr-2 text-left font-medium">
              {ACTIVITY_LABELS[s.activityType] ?? s.activityType}
            </th>
            <td className="py-2.5 px-2 text-right tabular-nums">
              {s.tripCount}
              {/* Recorded-count nuance hides on narrow screens to keep the
                  four columns from wrapping (sm+ shows it). */}
              {s.tripsWithRoute < s.tripCount && (
                <span className="hidden text-muted-foreground sm:inline"> · {s.tripsWithRoute} recorded</span>
              )}
            </td>
            <td className="py-2.5 px-2 text-right tabular-nums">{formatDistance(s.totalDistance)}</td>
            <td className="py-2.5 pl-2 text-right tabular-nums">
              {s.hasElevation ? `+${formatElevation(s.totalElevationGain)}` : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
