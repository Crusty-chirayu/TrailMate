import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
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

  it('keeps sharing policies, grants, and secure projections in the sharing migration', () => {
    const sharing = readFileSync(
      path.resolve('supabase/migrations/20260906000200_phase12c_sharing.sql'),
      'utf8',
    )
    expect(sharing).toContain('ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY')
    expect(sharing).toContain('FOR SELECT TO anon, authenticated')
    expect(sharing).toContain("visibility = 'public'")
    expect(sharing).toContain('SECURITY DEFINER')
    expect(sharing).toContain('CREATE OR REPLACE FUNCTION public.get_shared_trip')
    expect(sharing).toContain('CREATE OR REPLACE FUNCTION public.get_shared_route')
    expect(sharing).toContain('GRANT SELECT ON TABLE public.trips TO anon')
    expect(sharing).toContain('REVOKE EXECUTE ON FUNCTION public.get_shared_trip(text) FROM anon')
    // No write access is granted to anon anywhere in the sharing migration.
    expect(sharing.match(/grant\s+(insert|update|delete)\s+on\s+table\s+public\.[a-z_]+ to anon/gi)).toBeNull()
  })

  it('does not expose account fields in shared projections', () => {
    const sharing = readFileSync(
      path.resolve('supabase/migrations/20260906000200_phase12c_sharing.sql'),
      'utf8',
    )
    for (const field of ['user_id', 'email', 'auth.uid']) {
      // user_id may appear only in ownership policy checks; it must not be
      // returned by the SECURITY DEFINER projections.
      const projection = sharing.slice(sharing.indexOf('get_shared_trip'))
      expect(projection).not.toContain(`t.user_id`)
      expect(sharing.match(/user_id|email/gi)?.length ?? 0).toBeGreaterThan(0)
      void field
    }
  })
