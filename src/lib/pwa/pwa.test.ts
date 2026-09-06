import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function workspacePath(relative: string) {
  return resolve(root, relative)
}

async function readWorkspaceFile(relative: string) {
  return readFile(workspacePath(relative), 'utf8')
}

describe('PWA install assets', () => {
  it('ships a valid web app manifest with install fields', async () => {
    const manifest = JSON.parse(await readWorkspaceFile('public/manifest.webmanifest'))

    expect(manifest.name).toMatch(/TrailMate/)
    expect(manifest.short_name).toBe('TrailMate')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('references every icon in the manifest and the apple icon', async () => {
    const manifest = JSON.parse(await readWorkspaceFile('public/manifest.webmanifest'))

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')

    for (const icon of manifest.icons as Array<{ src: string }>) {
      const path = workspacePath(`public/${icon.src.replace(/^\//, '')}`)
      await expect(stat(path)).resolves.toBeDefined()
      await expect(stat(path)).resolves.toSatisfy((value) => value.isFile())
    }

    await expect(stat(workspacePath('public/icons/apple-touch-icon.png'))).resolves.toBeDefined()
  })

  it('registers a service worker that precaches the offline page', async () => {
    const sw = await readWorkspaceFile('public/sw.js')

    expect(sw).toContain("CACHE_NAME = 'trailmate-shell-v1'")
    expect(sw).toContain("'/offline.html'")
    expect(sw).toContain('self.addEventListener(\'fetch\'')
    expect(sw).toContain("self.skipWaiting()")
    expect(sw).toContain("self.clients.claim()")
  })
})

describe('offline fallback page', () => {
  it('is a self-contained, same-origin page', async () => {
    const offline = await readWorkspaceFile('public/offline.html')

    expect(offline).toContain('TrailMate')
    expect(offline).toContain('Retry when connected')
    expect(offline).toContain('href="/"')
  })
})
