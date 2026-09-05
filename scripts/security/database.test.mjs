import { describe, expect, it } from 'vitest'
import path from 'node:path'
import {
  validateDatabaseArtifacts,
  validateDatabaseTypes,
  validateSchemaSql,
} from './validate-database.mjs'

describe('database security artifacts', () => {
  it('keeps the schema snapshot, migration baseline, RLS, constraints, and types aligned', () => {
    expect(validateDatabaseArtifacts(path.resolve('.'))).toEqual([])
  })

  it('rejects a sensitive table without RLS or explicit authenticated policies', () => {
    const incomplete = 'CREATE TABLE public.trips (id uuid);'
    const errors = validateSchemaSql(incomplete, 'fixture')
    expect(errors).toContain('fixture: RLS is not enabled on public.trips')
    expect(errors).toContain('fixture: missing explicit authenticated SELECT policy on trips')
  })

  it('rejects anonymous table grants', () => {
    const errors = validateSchemaSql(
      'GRANT ALL ON TABLE public.trips TO anon;',
      'fixture',
    )
    expect(errors).toContain('fixture: grants table access to anon')
  })

  it('requires source_id across every route-point database operation type', () => {
    const incompleteTypes = 'route_points: { Row: { source_id: string | null } }\n gear_templates:'
    expect(validateDatabaseTypes(incompleteTypes)).toEqual([
      'database types: source_id must exist in route_points Row, Insert, and Update',
    ])
  })
})
