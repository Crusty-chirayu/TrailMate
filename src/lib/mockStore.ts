/**
 * MockStorage - LocalStorage fallback for development/testing
 * Used when Supabase environment variables are not configured
 */

interface MockTrip {
  id: string
  title: string
  activity_type: string
  planned_date: string | null
  status: string
  created_at: string
}

interface MockRoutePoint {
  id: string
  trip_id: string
  lat: number
  lng: number
  elevation: number | null
  recorded_at: string
  synced: boolean
}

interface MockGearTemplate {
  id: string
  name: string
  created_at: string
}

interface MockGearItem {
  id: string
  template_id: string
  item_name: string
  checked: boolean
  created_at: string
}

class MockStorage {
  private trips: MockTrip[] = []
  private routePoints: MockRoutePoint[] = []
  private gearTemplates: MockGearTemplate[] = []
  private gearItems: MockGearItem[] = []

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID()
    }
    // Fallback UUID generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  constructor() {
    // Load from localStorage if available
    if (typeof window !== 'undefined') {
      const savedTrips = localStorage.getItem('trailmate_trips')
      const savedRoutePoints = localStorage.getItem('trailmate_route_points')
      const savedGearTemplates = localStorage.getItem('trailmate_gear_templates')
      const savedGearItems = localStorage.getItem('trailmate_gear_items')

      if (savedTrips) this.trips = JSON.parse(savedTrips)
      if (savedRoutePoints) this.routePoints = JSON.parse(savedRoutePoints)
      if (savedGearTemplates) this.gearTemplates = JSON.parse(savedGearTemplates)
      if (savedGearItems) this.gearItems = JSON.parse(savedGearItems)
    }
  }

  private save() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('trailmate_trips', JSON.stringify(this.trips))
      localStorage.setItem('trailmate_route_points', JSON.stringify(this.routePoints))
      localStorage.setItem('trailmate_gear_templates', JSON.stringify(this.gearTemplates))
      localStorage.setItem('trailmate_gear_items', JSON.stringify(this.gearItems))
    }
  }

  // Trip methods
  getTrips(): MockTrip[] {
    return this.trips
  }

  getTripById(id: string): MockTrip | undefined {
    return this.trips.find(t => t.id === id)
  }

  createTrip(trip: Omit<MockTrip, 'id' | 'created_at'>): MockTrip {
    const newTrip: MockTrip = {
      ...trip,
      id: this.generateId(),
      created_at: new Date().toISOString(),
    }
    this.trips.push(newTrip)
    this.save()
    return newTrip
  }

  updateTrip(id: string, updates: Partial<MockTrip>): MockTrip | undefined {
    const index = this.trips.findIndex(t => t.id === id)
    if (index === -1) return undefined
    this.trips[index] = { ...this.trips[index], ...updates }
    this.save()
    return this.trips[index]
  }

  deleteTrip(id: string): boolean {
    const index = this.trips.findIndex(t => t.id === id)
    if (index === -1) return false
    this.trips.splice(index, 1)
    // Also delete associated route points
    this.routePoints = this.routePoints.filter(rp => rp.trip_id !== id)
    this.save()
    return true
  }

  // Route point methods
  getRoutePointsByTripId(tripId: string): MockRoutePoint[] {
    return this.routePoints.filter(rp => rp.trip_id === tripId)
  }

  createRoutePoint(point: Omit<MockRoutePoint, 'id' | 'recorded_at'>): MockRoutePoint {
    const newPoint: MockRoutePoint = {
      ...point,
      id: this.generateId(),
      recorded_at: new Date().toISOString(),
    }
    this.routePoints.push(newPoint)
    this.save()
    return newPoint
  }

  // Gear template methods
  getGearTemplates(): MockGearTemplate[] {
    return this.gearTemplates
  }

  createGearTemplate(template: Omit<MockGearTemplate, 'id' | 'created_at'>): MockGearTemplate {
    const newTemplate: MockGearTemplate = {
      ...template,
      id: this.generateId(),
      created_at: new Date().toISOString(),
    }
    this.gearTemplates.push(newTemplate)
    this.save()
    return newTemplate
  }

  deleteGearTemplate(id: string): boolean {
    const index = this.gearTemplates.findIndex(t => t.id === id)
    if (index === -1) return false
    this.gearTemplates.splice(index, 1)
    // Also delete associated gear items
    this.gearItems = this.gearItems.filter(gi => gi.template_id !== id)
    this.save()
    return true
  }

  // Gear item methods
  getGearItemsByTemplateId(templateId: string): MockGearItem[] {
    return this.gearItems.filter(gi => gi.template_id === templateId)
  }

  createGearItem(item: Omit<MockGearItem, 'id' | 'created_at'>): MockGearItem {
    const newItem: MockGearItem = {
      ...item,
      id: this.generateId(),
      created_at: new Date().toISOString(),
    }
    this.gearItems.push(newItem)
    this.save()
    return newItem
  }

  updateGearItem(id: string, updates: Partial<MockGearItem>): MockGearItem | undefined {
    const index = this.gearItems.findIndex(gi => gi.id === id)
    if (index === -1) return undefined
    this.gearItems[index] = { ...this.gearItems[index], ...updates }
    this.save()
    return this.gearItems[index]
  }

  deleteGearItem(id: string): boolean {
    const index = this.gearItems.findIndex(gi => gi.id === id)
    if (index === -1) return false
    this.gearItems.splice(index, 1)
    this.save()
    return true
  }
}

// Singleton instance
export const mockStorage = new MockStorage()
