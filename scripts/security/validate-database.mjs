#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const SENSITIVE_TABLES = [
  'trips',
  'route_points',
  'gear_templates',
  'gear_items',
  'trip_packing_items',
]

const REQUIRED_CONSTRAINTS = [
  'trips_title_valid',
  'trips_activity_type_valid',
  'trips_status_valid',
  'trips_visibility_valid',
  'trips_distance_valid',
  'trips_elevation_gain_valid',
  'trips_date_order_valid',
  'route_points_latitude_valid',
  'route_points_longitude_valid',
  'route_points_elevation_finite',
  'route_points_accuracy_valid',
  'route_points_source_id_valid',
  'gear_templates_name_valid',
  'gear_items_name_valid',
  'gear_items_quantity_valid',
  'gear_items_weight_valid',
  'trip_packing_items_name_valid',
  'trip_packing_items_quantity_valid',
  'trip_packing_items_weight_valid',
]

function compact(sql) {
  return sql.replace(/--.*$/gm, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function validateSchemaSql(sql, label = 'schema') {
  const errors = []
  const normalized = compact(sql)

  for (const table of SENSITIVE_TABLES) {
    if (!normalized.includes(`create table public.${table}`)) {
      errors.push(`${label}: missing table public.${table}`)
    }
    if (!normalized.includes(`alter table public.${table} enable row level security`)) {
      errors.push(`${label}: RLS is not enabled on public.${table}`)
    }
    if (!normalized.includes(`revoke all on table public.${table} from anon`)) {
      errors.push(`${label}: anonymous privileges are not revoked on public.${table}`)
    }

    for (const operation of ['select', 'insert', 'update', 'delete']) {
      const policyPattern = new RegExp(
        `create policy [^;]+ on public\\.${table} for ${operation} to authenticated(?: |;)`,
      )
      if (!policyPattern.test(normalized)) {
        errors.push(`${label}: missing explicit authenticated ${operation.toUpperCase()} policy on ${table}`)
      }
    }
  }

  if (/grant\s+all\s+on\s+table\s+public\.[a-z_]+\s+to\s+anon/.test(normalized)) {
    errors.push(`${label}: grants table access to anon`)
  }

  for (const constraint of REQUIRED_CONSTRAINTS) {
    if (!normalized.includes(`constraint ${constraint}`)) {
      errors.push(`${label}: missing constraint ${constraint}`)
    }
  }

  if (!normalized.includes('create unique index uq_trip_packing_items_trip_source on public.trip_packing_items(trip_id, source_item_id)')) {
    errors.push(`${label}: missing trip/source assignment uniqueness index`)
  }

  return errors
}

export function validateDatabaseTypes(types) {
  const routeSection = types.match(/route_points:\s*\{([\s\S]*?)\n\s*gear_templates:/)?.[1] ?? ''
  const sourceIdOccurrences = routeSection.match(/source_id\??:\s*string\s*\|\s*null/g)?.length ?? 0
  return sourceIdOccurrences === 3
    ? []
    : ['database types: source_id must exist in route_points Row, Insert, and Update']
}

export function validateDatabaseArtifacts(rootDirectory) {
  const read = relative => readFileSync(path.join(rootDirectory, relative), 'utf8')
  const schema = read('supabase/schema.sql')
  const baseline = read('supabase/migrations/0001_tracking_phase7.sql')
  const compatibility = read('supabase/migrations/0002_gear_system.sql')
  const hardening = read('supabase/migrations/20260906000100_phase12a_security_hardening.sql')
  const types = read('src/types/database.ts')
  const errors = [
    ...validateSchemaSql(schema, 'schema snapshot'),
    ...validateSchemaSql(baseline, 'migration baseline'),
    ...validateDatabaseTypes(types),
  ]

  const schemaBody = schema.slice(schema.indexOf('CREATE EXTENSION'))
  const baselineBody = baseline.slice(baseline.indexOf('CREATE EXTENSION'))
  if (schemaBody !== baselineBody) {
    errors.push('schema snapshot and authoritative migration baseline have drifted')
  }

  const migrationFiles = readdirSync(path.join(rootDirectory, 'supabase/migrations'))
    .filter(file => file.endsWith('.sql'))
  const versions = migrationFiles.map(file => file.split('_')[0])
  if (new Set(versions).size !== versions.length) {
    errors.push('migration versions are not unique')
  }

  const normalizedCompatibility = compact(compatibility)
  for (const required of [
    'add column if not exists required',
    'create table if not exists public.trip_packing_items',
    'create index if not exists',
    'drop trigger if exists',
    'drop policy if exists',
  ]) {
    if (!normalizedCompatibility.includes(required)) {
      errors.push(`compatibility migration: missing ${required}`)
    }
  }

  const normalizedHardening = compact(hardening)
  if (!normalizedHardening.startsWith('begin;') || !normalizedHardening.endsWith('commit;')) {
    errors.push('hardening migration: must be atomic')
  }
  for (const required of [
    'not valid',
    'uq_trip_packing_items_trip_source',
    'ranked_assignments',
    'from pg_policies',
    'revoke all on table public.trip_packing_items from anon',
  ]) {
    if (!normalizedHardening.includes(required)) {
      errors.push(`hardening migration: missing ${required}`)
    }
  }

  return errors
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const errors = validateDatabaseArtifacts(root)
  if (errors.length > 0) {
    console.error('Database artifact validation failed:')
    for (const error of errors) console.error(`- ${error}`)
    process.exit(1)
  }
  console.log('Database artifact validation passed.')
}
