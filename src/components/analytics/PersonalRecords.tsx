// Personal records (all-time) — each record links to its source trip.
// Only records backed by real recorded routes are passed in; the parent
// renders the empty state when there are none.

import Link from 'next/link'

export interface PersonalRecordEntry {
  key: 'longest-trip' | 'largest-ascent' | 'highest-elevation' | 'longest-moving-time'
  label: string
  value: string
  tripId: string
  tripTitle: string
  /** Reference date of the source trip (for display). */
  date: Date | null
}

export default function PersonalRecords({ entries }: { entries: PersonalRecordEntry[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-md overflow-hidden border border-border">
      {entries.map(entry => (
        <div key={entry.key} className="bg-background px-4 py-4 flex flex-col justify-between gap-2">
          <dt className="text-xs text-muted-foreground uppercase tracking-wider">{entry.label}</dt>
          <dd>
            <span className="block text-xl font-bold tabular-nums tracking-tight">{entry.value}</span>
            <Link
              href={`/trips/${entry.tripId}`}
              className="mt-1 block text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
            >
              {entry.tripTitle}
              {entry.date ? ` · ${entry.date.toLocaleDateString()}` : ''}
            </Link>
          </dd>
        </div>
      ))}
    </dl>
  )
}
