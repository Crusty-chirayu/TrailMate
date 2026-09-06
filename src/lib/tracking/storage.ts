// Durable local storage for tracking data.
//
// The browser implementation uses IndexedDB (suitable for thousands of route
// points; localStorage is intentionally avoided). An in-memory adapter is
// provided so the persistence layer can be unit-tested without a browser.
//
// Version 2 adds user-scoped records. Every session and point carries the
// owning user id, and each store has a by-user index so records from one
// account are never visible to another. The separate "pending" queue store
// from version 1 is removed: unsynced points are now derived from a string
// queue key on the points record ("<userId>:0"), which makes point persistence
// a single atomic write instead of two separate transactions. Booleans are not
// valid IndexedDB keys, so the queue key is a string rather than a composite
// [userId, synced] index.

export const DB_NAME = 'trailmate'
export const DB_VERSION = 2
export const STORE_SESSIONS = 'sessions'
export const STORE_POINTS = 'points'
/** Key/value metadata, e.g. one-time local migration flags. */
export const STORE_META = 'meta'
/** Removed in v2; kept only so the upgrade path can drop it deterministically. */
export const STORE_PENDING_LEGACY = 'pending'

/** IndexedDB indexes that the TrackingStore relies on. */
export const POINT_INDEX_BY_TRIP = 'byTrip'
export const POINT_INDEX_BY_SESSION = 'bySession'
/** String queue key ("<userId>:0" unsynced, "<userId>:1" synced). */
export const POINT_INDEX_BY_QUEUE = 'byQueue'
export const SESSION_INDEX_BY_USER = 'byUser'

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

/** Resolves a logical index name to the object field it mirrors. */
function indexFieldKey(index: string): string {
  switch (index) {
    case POINT_INDEX_BY_TRIP:
      return 'tripId'
    case POINT_INDEX_BY_SESSION:
      return 'sessionId'
    case POINT_INDEX_BY_QUEUE:
      return 'queueKey'
    case SESSION_INDEX_BY_USER:
      return 'userId'
    default:
      return index
  }
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
        const oldVersion = Number((request as IDBOpenDBRequest & { oldVersion?: number }).oldVersion ?? 0)
        const tx = request.transaction!

        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
          sessions.createIndex(SESSION_INDEX_BY_USER, 'userId')
        } else if (oldVersion < 2) {
          const sessions = tx.objectStore(STORE_SESSIONS)
          if (!sessions.indexNames.contains(SESSION_INDEX_BY_USER)) {
            sessions.createIndex(SESSION_INDEX_BY_USER, 'userId')
          }
        }

        if (!db.objectStoreNames.contains(STORE_POINTS)) {
          const points = db.createObjectStore(STORE_POINTS, { keyPath: 'id' })
          points.createIndex(POINT_INDEX_BY_TRIP, 'tripId')
          points.createIndex(POINT_INDEX_BY_SESSION, 'sessionId')
          points.createIndex(POINT_INDEX_BY_QUEUE, 'queueKey')
        } else if (oldVersion < 2) {
          const points = tx.objectStore(STORE_POINTS)
          if (!points.indexNames.contains(POINT_INDEX_BY_TRIP)) {
            points.createIndex(POINT_INDEX_BY_TRIP, 'tripId')
          }
          if (!points.indexNames.contains(POINT_INDEX_BY_SESSION)) {
            points.createIndex(POINT_INDEX_BY_SESSION, 'sessionId')
          }
          if (!points.indexNames.contains(POINT_INDEX_BY_QUEUE)) {
            points.createIndex(POINT_INDEX_BY_QUEUE, 'queueKey')
          }
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'id' })
        }

        // The v1 pending queue is obsolete; its state is derived from points.
        if (oldVersion < 2 && db.objectStoreNames.contains(STORE_PENDING_LEGACY)) {
          db.deleteObjectStore(STORE_PENDING_LEGACY)
        }
        // Also drop the store if it somehow still exists at any later version.
        if (db.objectStoreNames.contains(STORE_PENDING_LEGACY)) {
          db.deleteObjectStore(STORE_PENDING_LEGACY)
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
        key === null || key === undefined ? undefined : IDBKeyRange.only(key as IDBValidKey)
      const reverse = opts?.direction === 'prev' || opts?.direction === 'prevunique'
      // getAll is a single native request, far cheaper than cursor stepping;
      // reverse ordering is applied in memory (index key order is ascending).
      const count = !reverse && opts?.limit ? opts.limit : undefined
      const req = indexStore.getAll(range, count)
      req.onsuccess = () => {
        let results = (req.result as T[]) ?? []
        if (reverse) {
          results = results.reverse()
          if (opts?.limit) results = results.slice(0, opts.limit)
        }
        resolve(results)
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
 * In-memory adapter for tests and non-browser contexts. Behaviour mirrors the
 * IndexedDB adapter including composite [userId, synced] index lookups.
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
    const field = indexFieldKey(index)
    const values = Array.from(this.store(store).values()) as T[]
    const filtered = values.filter(v => {
      if (v === null || typeof v !== 'object') return false
      return (v as Record<string, unknown>)[field] === key
    })
    const result = filtered as T[]
    if (opts?.direction === 'prev' || opts?.direction === 'prevunique') result.reverse()
    if (opts?.limit) return result.slice(0, opts.limit)
    return result
  }

  async delete(store: string, key: string): Promise<void> {
    this.store(store).delete(key)
  }

  async clear(store: string): Promise<void> {
    this.store(store).clear()
  }
}
