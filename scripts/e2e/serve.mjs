#!/usr/bin/env node

// E2E test server launcher.
//
// TrailMate's production build requires placeholder Supabase credentials at
// build time (the dashboard's `useAuth` calls `createClient()` during
// prerendering). However, the E2E suite drives the *unauthenticated* surface
// and the authentication boundary, so we deliberately start the runtime server
// WITHOUT the Supabase credentials. With no credentials the auth proxy fails
// closed and redirects every protected route to /login instantly, and the
// public auth pages render from their prebuilt static output. This keeps the
// suite deterministic and free of any external network dependency.
//
// Playwright invokes this via the `webServer` option in playwright.config.ts.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const port = Number(process.env.E2E_PORT || 3100)
const buildIdFile = path.join(root, '.next', 'BUILD_ID')

/** Build once with placeholder credentials if no production build exists. */
function buildIfNeeded() {
  if (existsSync(buildIdFile)) {
    return
  }
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'https://dummy.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
  }
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, env, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('E2E: production build failed.')
    process.exit(result.status ?? 1)
  }
}

buildIfNeeded()

// Runtime environment intentionally drops the Supabase credentials so the
// proxy can fail closed toward /login without any external network call.
const serverEnv = { ...process.env }
delete serverEnv.NEXT_PUBLIC_SUPABASE_URL
delete serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY

const server = spawn('npx', ['next', 'start', '-p', String(port)], {
  cwd: root,
  env: serverEnv,
  stdio: 'inherit',
})

function shutdown(signal) {
  server.kill(signal)
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGHUP', () => shutdown('SIGHUP'))
server.on('exit', (code) => process.exit(code ?? 0))
