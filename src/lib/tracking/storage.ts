// Durable local storage for tracking data.
//
// The browser implementation uses IndexedDB (suitable for thousands of route
// points; localStorage is intentionally avoided). An in-memory adapter is
// provided so the persistence layer can be unit-tested without a browser.

export const DB_NAME = 'trailmate'
export const DB_VERSION = 1
export const STORE_SESSIONS = 'sessions'
export const STORE_POINTS = 'points'
/** Lightweight queue of point ids awaiting upload (boolean keys are invalid in IndexedDB). */
export const STORE_PENDING = 'pending'

/** IndexedDB indexes that the TrackingStore relies on. */
export const POINT_INDEX_BY_TRIP = 'byTrip'
export const POINT_INDEX_BY_SESSION = 'bySession'

export interface DbAdapter {
  get<T>(store: string, key: string): Promise<T | undefined>
  put<T>(store: string, value: T): Promise<void>
  putMany<T>(store: string, values: T[]): Promise<void>
  getAll<T>(store: string): Promise<T[]>
  getAllByIndex<T>(
    store: string,
    index: string,
    key: unknown,
    opts?: { direction?: 'next' | 'nextunique' | 'prev' | 'prevunique'; limit?: number },
  ): Promise<T[]>
  delete(store: string, key: string): Promise<void>
  clear(store: string): Promise<void>
}

interface RecordLike {
  id: string
}

/** Maps a logical IndexedDB index name to the object field(s) it mirrors. */
function indexFieldKey(index: string): string {
  if (index === POINT_INDEX_BY_TRIP) return 'tripId'
  if (index === POINT_INDEX_BY_SESSION) return 'sessionId'
  // Fallback: assume the index name matches a top-level field.
  return index
}

/**
 * IndexedDB-backed adapter for browser use.
 */
export class IndexedDbAdapter implements DbAdapter {
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(
    private dbName: string = DB_NAME,
    private version: number = DB_VERSION,
  ) {}

  private getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB is not available in this environment'))
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORE_POINTS)) {
          const points = db.createObjectStore(STORE_POINTS, { keyPath: 'id' })
          points.createIndex(POINT_INDEX_BY_TRIP, 'tripId')
          points.createIndex(POINT_INDEX_BY_SESSION, 'sessionId')
        }
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.dbPromise
  }

  async get<T>(store: string, key: string): Promise<T | undefined> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result as T | undefined)
      req.onerror = () => reject(req.error)
    })
  }

  async put<T>(store: string, value: T): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async putMany<T>(store: string, values: T[]): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      const objectStore = tx.objectStore(store)
      for (const value of values) objectStore.put(value)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async getAll<T>(store: string): Promise<T[]> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const req = tx.objectStore(store).getAll()
      req.onsuccess = () => resolve((req.result as T[]) ?? [])
      req.onerror = () => reject(req.error)
    })
  }

  async getAllByIndex<T>(
    store: string,
    index: string,
    key: unknown,
    opts?: { direction?: 'next' | 'nextunique' | 'prev' | 'prevunique'; limit?: number },
  ): Promise<T[]> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const indexStore = tx.objectStore(store).index(index)
      const range =
        key === null || key === undefined ? undefined : IDBKeyRange.only(key as string[])
      const req = indexStore.openCursor(range, opts?.direction ?? 'next')
      const results: T[] = []
      req.onsuccess = () => {
        const cursor = req.result
        if (cursor) {
          results.push(cursor.value as T)
          if (opts?.limit && results.length >= opts.limit) {
            resolve(results)
            return
          }
          cursor.continue()
        } else {
          resolve(results)
        }
      }
      req.onerror = () => reject(req.error)
    })
  }

  async delete(store: string, key: string): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async clear(store: string): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
}

/**
 * In-memory adapter for tests and non-browser contexts.
 */
export class MemoryDbAdapter implements DbAdapter {
  private stores = new Map<string, Map<string, unknown>>()

  private store(name: string): Map<string, unknown> {
    if (!this.stores.has(name)) this.stores.set(name, new Map())
    return this.stores.get(name)!
  }

  private keyOf(value: RecordLike): string {
    return value.id
  }

  async get<T>(store: string, key: string): Promise<T | undefined> {
    return this.store(store).get(key) as T | undefined
  }

  async put<T>(store: string, value: T): Promise<void> {
    this.store(store).set(this.keyOf(value as unknown as RecordLike), value)
  }

  async putMany<T>(store: string, values: T[]): Promise<void> {
    for (const value of values) await this.put(store, value)
  }

  async getAll<T>(store: string): Promise<T[]> {
    return Array.from(this.store(store).values()) as T[]
  }

  async getAllByIndex<T>(
    store: string,
    index: string,
    key: unknown,
    opts?: { direction?: string; limit?: number },
  ): Promise<T[]> {
    const fieldKey = indexFieldKey(index)
    let values = Array.from(this.store(store).values()) as T[]
    const filtered = values.filter(
      v => v !== null && typeof v === 'object' && (v as Record<string, unknown>)[fieldKey] === key,
    )
    values = filtered as T[]
    if (opts?.direction === 'prev' || opts?.direction === 'prevunique') values.reverse()
    if (opts?.limit) values = values.slice(0, opts.limit)
    return values
  }

  async delete(store: string, key: string): Promise<void> {
    this.store(store).delete(key)
  }

  async clear(store: string): Promise<void> {
    this.store(store).clear()
  }
}