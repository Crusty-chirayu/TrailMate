'use client'

// Route map built with Leaflet + react-leaflet (open-source, no API key, no
// proprietary tile provider). The route data passed in is the source of truth;
// the map is purely a visualization and never fabricates location.

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { cn } from '@/lib/utils'

export interface MapCoordinate {
  latitude: number
  longitude: number
}

function FollowCurrent({ target }: { target?: MapCoordinate }) {
  const map = useMap()
  const lastReset = useRef(0)
  useEffect(() => {
    if (!target) return
    const now = Date.now()
    // Avoid fighting a manual pan by only recentering occasionally.
    if (now - lastReset.current < 5_000) return
    lastReset.current = now
    map.panTo([target.latitude, target.longitude], { animate: true, duration: 0.4 })
  }, [target, map])
  return null
}

interface TrackingMapProps {
  points: MapCoordinate[]
  current?: MapCoordinate
  className?: string
}

export default function TrackingMap({ points, current, className }: TrackingMapProps) {
  const fallback = { latitude: 20, longitude: 0 }
  const center = current ?? points[points.length - 1] ?? fallback
  const route = (points || []).map(p => [p.latitude, p.longitude] as [number, number])
  const hasRoute = route.length >= 2

  return (
    <div className={cn('relative h-full w-full min-h-64 overflow-hidden bg-slate-950', className)}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={16}
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <FollowCurrent target={current} />
        {hasRoute && (
          <Polyline
            positions={route}
            pathOptions={{ color: '#10b981', weight: 4, opacity: 0.9 }}
          />
        )}
        {current && (
          <CircleMarker
            center={[current.latitude, current.longitude]}
            radius={7}
            pathOptions={{ color: '#34d399', weight: 3, fillColor: '#10b981', fillOpacity: 1 }}
          />
        )}
      </MapContainer>
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Waiting for GPS…
        </div>
      )}
    </div>
  )
}