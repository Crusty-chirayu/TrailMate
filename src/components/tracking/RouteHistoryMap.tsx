'use client'

// Static route-history map. Unlike TrackingMap (live tracking), this variant
// fits the viewport to the recorded route once and marks start/end. The route
// data passed in is the source of truth; the map never fabricates location.

import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

export interface HistoryPoint {
  latitude: number
  longitude: number
}

function FitRoute({ points }: { points: HistoryPoint[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 16)
      return
    }
    const lats = points.map(p => p.latitude)
    const lngs = points.map(p => p.longitude)
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [24, 24] },
    )
  }, [map, points])
  return null
}

export default function RouteHistoryMap({ points }: { points: HistoryPoint[] }) {
  const route = points.map(p => [p.latitude, p.longitude] as [number, number])
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <MapContainer
      center={first ? [first.latitude, first.longitude] : [20, 0]}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <FitRoute points={points} />
      {route.length >= 2 && (
        <Polyline positions={route} pathOptions={{ color: '#10b981', weight: 4, opacity: 0.9 }} />
      )}
      {first && (
        <CircleMarker
          center={[first.latitude, first.longitude]}
          radius={6}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#10b981', fillOpacity: 1 }}
        />
      )}
      {last && points.length > 1 && (
        <CircleMarker
          center={[last.latitude, last.longitude]}
          radius={6}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }}
        />
      )}
    </MapContainer>
  )
}