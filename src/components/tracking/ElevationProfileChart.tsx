'use client'

// Elevation profile chart: dependency-free SVG rendering of real recorded
// altitude samples against cumulative distance. Never fabricates data —
// the parent only renders this when a genuine altitude series exists.

import { useMemo } from 'react'
import type { ElevationSample } from '@/lib/domain/tracking/elevation'
import { formatElevation } from '@/lib/tracking/format'

interface ElevationProfileChartProps {
  samples: ElevationSample[]
  className?: string
}

export default function ElevationProfileChart({ samples, className }: ElevationProfileChartProps) {
  const geometry = useMemo(() => {
    const width = 640
    const height = 180
    const padX = 8
    const padY = 12

    if (samples.length < 2) return null

    const minDistance = samples[0].distance
    const maxDistance = samples[samples.length - 1].distance
    const minAltitude = Math.min(...samples.map(s => s.altitude))
    const maxAltitude = Math.max(...samples.map(s => s.altitude))

    const spanDistance = Math.max(1, maxDistance - minDistance)
    // Give flat terrain some vertical breathing room.
    const spanAltitude = Math.max(20, maxAltitude - minAltitude)

    const x = (distance: number) =>
      padX + ((distance - minDistance) / spanDistance) * (width - padX * 2)
    const y = (altitude: number) =>
      height - padY - ((altitude - minAltitude) / spanAltitude) * (height - padY * 2)

    const linePoints = samples.map(s => `${x(s.distance).toFixed(1)},${y(s.altitude).toFixed(1)}`)
    const areaPoints = [
      `${padX},${height - padY}`,
      ...linePoints,
      `${x(samples[samples.length - 1].distance).toFixed(1)},${height - padY}`,
    ]

    return {
      width,
      height,
      line: `M ${linePoints.join(' L ')}`,
      area: `M ${areaPoints.join(' L ')} Z`,
      minAltitude,
      maxAltitude,
      maxDistance,
    }
  }, [samples])

  if (!geometry) return null

  const summary = `Elevation profile from ${formatElevation(geometry.minAltitude)} to ${formatElevation(geometry.maxAltitude)} over ${(geometry.maxDistance / 1000).toFixed(1)} kilometers`

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        className="w-full h-auto"
        role="img"
        aria-label={summary}
        preserveAspectRatio="none"
      >
        {/* Baseline gridline */}
        <line
          x1={0}
          y1={geometry.height - 12}
          x2={geometry.width}
          y2={geometry.height - 12}
          stroke="currentColor"
          strokeOpacity={0.15}
        />
        <path d={geometry.area} fill="currentColor" fillOpacity={0.12} stroke="none" />
        <path
          d={geometry.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="mt-2 flex items-center justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatElevation(geometry.minAltitude)} — {formatElevation(geometry.maxAltitude)}</span>
        <span>{(geometry.maxDistance / 1000).toFixed(1)} km</span>
      </figcaption>
      {/* Screen-reader table of sampled values */}
      <table className="sr-only">
        <caption>{summary}</caption>
        <thead>
          <tr>
            <th scope="col">Distance (km)</th>
            <th scope="col">Altitude (m)</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s, i) => (
            <tr key={i}>
              <td>{(s.distance / 1000).toFixed(2)}</td>
              <td>{Math.round(s.altitude)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}