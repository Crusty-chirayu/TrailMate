#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const root = new URL('../../', import.meta.url)
const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean)

const forbiddenEnvFiles = tracked.filter(file =>
  /(^|\/)\.env(?:\..+)?$/.test(file) && !file.endsWith('.env.example'),
)

const signatures = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub access token', /gh[oprsu]_[A-Za-z0-9_]{30,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{20,}/],
  ['JWT-like credential', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['credential-bearing database URL', /(?:postgres(?:ql)?|mysql):\/\/[^\s:@/]+:[^\s@/]+@/i],
  ['Supabase service-role assignment', /SUPABASE_SERVICE_ROLE(?:_KEY)?\s*=\s*(?!your-|placeholder|$)\S+/i],
]

const findings = []
for (const file of tracked) {
  let contents
  try {
    contents = readFileSync(new URL(file, root), 'utf8')
  } catch {
    continue
  }
  if (contents.includes('\0')) continue
  for (const [label, pattern] of signatures) {
    if (pattern.test(contents)) findings.push({ file, label })
  }
}

if (forbiddenEnvFiles.length > 0) {
  for (const file of forbiddenEnvFiles) findings.push({ file, label: 'tracked environment file' })
}

if (findings.length > 0) {
  console.error('Secret scan failed. Potential credential material was found:')
  for (const finding of findings) {
    // Report location and category only. Never echo matched material.
    console.error(`- ${finding.file}: ${finding.label}`)
  }
  process.exit(1)
}

const historicalEnvCommits = execFileSync(
  'git',
  ['rev-list', '--all', '--', '.env', '.env.local'],
  { cwd: root, encoding: 'utf8' },
).trim().split('\n').filter(Boolean).length

console.log(`Secret scan passed for ${tracked.length} tracked files.`)
if (historicalEnvCommits > 0) {
  console.log(
    `Historical environment-file changes detected in ${historicalEnvCommits} commit(s); exposed credentials must remain rotated.`,
  )
}
