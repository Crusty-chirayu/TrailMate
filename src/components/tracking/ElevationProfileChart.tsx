'use client'

// Interactive elevation profile: dependency-free SVG area chart.
// Consumes the domain ElevationProfile from buildElevationProfile — no
// distance/altitude math happens in this component.
//
// Accessibility: role=img with an aria-label summary, plus a visually-hidden
// <table> exposing the same samples as structured text for screen readers.

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { ElevationSample } from '@/lib/domain/tracking/elevation'
import { formatElevation } from '@/lib/tracking/format'


export interface ElevationProfileChartProps {
  samples: ElevationSample[]
  totalDistance: number
  gain: number
  loss: number
  className?: string
}

interface Point { x: number; y: number }

function ElevationProfileChart({
  samples,
  totalDistance,
  gain,
  loss,
  className,
}: ElevationProfileChartProps) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null)

  const margin = { top: 16, right: 12, bottom: 28, left: 40 }
  const width = 640
  const height = 220
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom

  const maxDistance = Math.max(totalDistance, 1)
  const allHeights = samples.map(s => s.altitude)
  const floor = Math.min(...allHeights)
  const ceil = Math.max(...allHeights)
  const span = Math.max(ceil - floor, 1) // guard flat routes

  const x = (s: ElevationSample) => (s.distance / maxDistance) * plotW
  const y = (altitude: number) => plotH - ((altitude - floor) / span) * plotH

  const points: Point[] = samples.map(s => ({ x: margin.left + x(s), y: margin.top + y(s.altitude) }))

  // Hover crosshair: track offset within the SVG plot.
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg || samples.length === 0) {
      setHoverIndex(null)
      return
    }
    const rect = svg.getBoundingClientRect()
    const offsetX = e.clientX - rect.left
    const distanceAtCursor = (offsetX / plotW) * maxDistance
    let best = 0
    for (let i = 1; i < samples.length; i++) {
      if (Math.abs(samples[i].distance - distanceAtCursor) < Math.abs(samples[best].distance - distanceAtCursor)) {
        best = i
      }
    }
    setHoverIndex(best)
  }

  const handlePointerLeave = () => setHoverIndex(null)

  const areaPath = buildAreaPath(points, margin.left, margin.top + plotH, plotW)
  const linePath = buildLinePath(points)

  // Gridlines (5 horizontal).
  const gridlineCount = 5
  const gridlines: Point[][] = []
  for (let i = 0; i <= gridlineCount; i++) {
    const altitude = floor + (span * i) / gridlineCount
    const gy = margin.top + y(altitude)
    gridlines.push([{ x: margin.left, y: gy }, { x: margin.left + plotW, y: gy }])
  }

  const hover = hoverIndex !== null ? samples[hoverIndex] : null

  return (
    <div className={cn('w-full', className)}>
      <table className="sr-only">
        <caption>Elevation profile data</caption>
        <thead>
          <tr><th scope="col">Distance from start</th><th scope="col">Elevation</th></tr>
        </thead>
        <tbody>
          {samples.map((s, i) => (
            <tr key={i}>
              <td>{formatElevation(s.distance)} m</td>
              <td>{formatElevation(s.altitude)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Elevation profile: ${formatElevation(gain)} ascent, ${formatElevation(loss)} descent over ${formatElevation(totalDistance)} meters`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {/* The profile panel is a fixed light "paper map" surface inside
            the app theme; it uses explicit colors, not theme tokens, which
            are HSL triplets and invalid as bare SVG color values. */}
        <rect x={margin.left} y={margin.top} width={plotW} height={plotH} fill="#f8fafc" rx={4} />
        {gridlines.map((g, i) => (
          <line key={`grid-${i}`} x1={g[0].x} y1={g[0].y} x2={g[1].x} y2={g[1].y} stroke="#e2e8f0" strokeWidth={1} />
        ))}
        <path d={areaPath} fill="rgba(100, 150, 255, 0.18)" />
        <path d={linePath} fill="none" stroke="#4a94ff" strokeWidth={2} />

        {points.length > 0 && (
          <>
            {(() => {
              let minP = 0
              let maxP = 0
              for (let i = 1; i < samples.length; i++) {
                if (samples[i].altitude < samples[minP].altitude) minP = i
                if (samples[i].altitude > samples[maxP].altitude) maxP = i
              }
              const minPt = points[minP]
              const maxPt = points[maxP]
              return (
                <>
                  <circle cx={minPt.x} cy={minPt.y} r={3.5} fill="#94a3b8" />
                  <text x={minPt.x} y={minPt.y - 8} fontSize={10} textAnchor="middle" fill="#475569">low</text>
                  <circle cx={maxPt.x} cy={maxPt.y} r={3.5} fill="#22c55e" />
                  <text x={maxPt.x} y={maxPt.y - 8} fontSize={10} textAnchor="middle" fill="#475569">high</text>
                </>
              )
            })()}
          </>
        )}
        {points.length > 0 && (
          <>
            <circle cx={points[0].x} cy={points[0].y} r={5} fill="#22c55e" stroke="white" strokeWidth={1.5} />
            <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={5} fill="#f97316" stroke="white" strokeWidth={1.5} />
          </>
        )}

        {hover && (
          <>
            <line
              x1={margin.left}
              y1={margin.top + y(hover.altitude)}
              x2={margin.left + plotW}
              y2={margin.top + y(hover.altitude)}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={margin.left + x(hover)} cy={margin.top + y(hover.altitude)} r={4} fill="#0f172a" />
            <foreignObject x={margin.left + x(hover) + 8} y={margin.top + y(hover.altitude) - 28} width={140} height={48}>
              <div className="bg-popover border border-border rounded px-2 py-1 text-xs shadow-lg">
                <div className="font-medium">{formatElevation(hover.altitude)}</div>
                <div className="text-muted-foreground">{formatElevation(hover.distance)} m from start</div>
              </div>
            </foreignObject>
          </>
        )}
      </svg>
      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
        <span>Start</span>
        <span>End — {formatElevation(totalDistance)}</span>
      </div>
    </div>
  )
}

function buildLinePath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`
  }
  return d
}

function buildAreaPath(points: Point[], left: number, baselineY: number, plotW: number): string {
  if (points.length === 0) return ''
  let d = `M ${left} ${baselineY}`
  for (const p of points) {
    d += ` L ${p.x} ${p.y}`
  }
  d += ` L ${left + plotW} ${baselineY} Z`
  return d
}

export default ElevationProfileChart
