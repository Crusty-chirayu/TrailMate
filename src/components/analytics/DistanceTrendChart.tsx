// Distance-over-time trend: dependency-free SVG bar chart (server component —
// the data is static per render, so no client JS is required).
//
// Consumes TrendBucket[] from buildTrendSeries — no math happens here.
//
// Accessibility: role="img" with a spoken summary, plus a visually-hidden
// data table exposing every bucket for screen readers. Information is never
// conveyed by color alone: bars are paired with axis labels, a spoken
// summary, and the full data table.

import type { TrendBucket, TrendGranularity } from '@/lib/domain/tracking/analytics'
import { formatDistance } from '@/lib/tracking/format'

export interface DistanceTrendChartProps {
  buckets: TrendBucket[]
  granularity: TrendGranularity
  /** e.g. "last 30 days" / "all time" — used in the spoken summary. */
  windowLabel: string
}

const GRANULARITY_LABEL: Record<TrendGranularity, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
}

export default function DistanceTrendChart({ buckets, granularity, windowLabel }: DistanceTrendChartProps) {
  const margin = { top: 26, right: 8, bottom: 26, left: 8 }
  const width = 640
  const height = 200
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const baseline = margin.top + plotH

  const total = buckets.reduce((sum, b) => sum + b.distance, 0)
  const max = buckets.reduce((m, b) => Math.max(m, b.distance), 0)
  const scaleMax = Math.max(max, 1)

  const n = Math.max(buckets.length, 1)
  const step = plotW / n
  const barW = Math.max(step * 0.68, 2)

  let busiestIndex = 0
  for (let i = 1; i < buckets.length; i++) {
    if (buckets[i].distance > buckets[busiestIndex].distance) busiestIndex = i
  }
  const busiest = buckets[busiestIndex]

  const recordedCount = buckets.filter(b => b.distance > 0).length
  const unit = GRANULARITY_LABEL[granularity]

  const ariaLabel =
    `Distance per ${unit} for ${windowLabel}: ${formatDistance(total)} total, ` +
    `recorded in ${recordedCount} of ${buckets.length} ${unit}s. ` +
    (max > 0
      ? `Most active ${busiest.label} with ${formatDistance(busiest.distance)}.`
      : 'No recorded distance in this period.')

  return (
    <div className="w-full">
      <table className="sr-only">
        <caption>Distance per {unit} for {windowLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Trips</th>
            <th scope="col">Distance</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map(b => (
            <tr key={b.key}>
              <td>{b.label}</td>
              <td>{b.tripCount}</td>
              <td>{formatDistance(b.distance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Baseline */}
        <line x1={margin.left} y1={baseline} x2={margin.left + plotW} y2={baseline} stroke="hsl(var(--border))" strokeWidth={1} />

        {buckets.map((b, i) => {
          const h = (b.distance / scaleMax) * plotH
          const x = margin.left + i * step + (step - barW) / 2
          const isBusiest = i === busiestIndex && max > 0
          return (
            <rect
              key={b.key}
              x={x}
              y={baseline - h}
              width={barW}
              height={Math.max(h, b.distance > 0 ? 2 : 0)}
              rx={1.5}
              fill="hsl(var(--primary))"
              opacity={isBusiest ? 1 : 0.55}
            />
          )
        })}

        {max > 0 && (
          <text
            x={margin.left + busiestIndex * step + step / 2}
            y={baseline - (busiest.distance / scaleMax) * plotH - 7}
            fontSize={11}
            fontWeight={600}
            textAnchor="middle"
            fill="hsl(var(--primary))"
          >
            {formatDistance(busiest.distance)}
          </text>
        )}

        {/* X-axis labels: first, middle, last (capped to avoid crowding) */}
        <text x={margin.left} y={height - 8} fontSize={10} textAnchor="start" fill="hsl(var(--muted-foreground))">
          {buckets[0]?.label}
        </text>
        {n > 2 && n % 2 === 1 && (
          <text
            x={margin.left + ((n - 1) / 2) * step + step / 2}
            y={height - 8}
            fontSize={10}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
          >
            {buckets[(n - 1) / 2]?.label}
          </text>
        )}
        {n > 1 && (
          <text x={margin.left + plotW} y={height - 8} fontSize={10} textAnchor="end" fill="hsl(var(--muted-foreground))">
            {buckets[n - 1]?.label}
          </text>
        )}
      </svg>
    </div>
  )
}
