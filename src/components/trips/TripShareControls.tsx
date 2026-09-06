'use client'

// Owner-facing trip sharing controls.
//
// A trip must be visibility='shared' before share links can be created; the
// owner can create, copy, and revoke tokens. Revoking a token immediately
// removes access because the share RPC validates the token against the table.

import { useCallback, useState } from 'react'
import { Share2, Copy, Trash2, ExternalLink, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface ShareLink {
  id: string
  token: string
}

interface TripShareControlsProps {
  tripId: string
  isSharedVisibility: boolean
  isPublicVisibility: boolean
  initialLinks: ShareLink[]
  publicUrl?: string
  onCreate: (tripId: string) => Promise<{ ok: boolean; link?: ShareLink; error?: string }>
  onRevoke: (shareId: string) => Promise<{ ok: boolean; error?: string }>
  onMakeShared: (tripId: string) => Promise<{ ok: boolean; error?: string }>
}

export default function TripShareControls({
  tripId,
  isSharedVisibility,
  isPublicVisibility,
  initialLinks,
  publicUrl,
  onCreate,
  onRevoke,
  onMakeShared,
}: TripShareControlsProps) {
  const [links, setLinks] = useState<ShareLink[]>(initialLinks)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const shareUrl = useCallback((token: string) => `${window.location.origin}/share/${token}`, [])

  const copyLink = useCallback(
    async (token: string) => {
      try {
        await navigator.clipboard.writeText(shareUrl(token))
        setCopied(token)
        setTimeout(() => setCopied(null), 2000)
      } catch {
        setError('Could not copy the link. Select it manually.')
      }
    },
    [shareUrl],
  )

  const handleCreate = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await onCreate(tripId)
      if (result.ok && result.link) {
        setLinks(prev => [result.link!, ...prev])
      } else {
        setError(result.error ?? 'Could not create a share link.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async (shareId: string) => {
    setBusy(true)
    setError(null)
    try {
      const result = await onRevoke(shareId)
      if (result.ok) {
        setLinks(prev => prev.filter(l => l.id !== shareId))
      } else {
        setError(result.error ?? 'Could not revoke the share link.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleMakeShared = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await onMakeShared(tripId)
      if (!result.ok) setError(result.error ?? 'Could not enable sharing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="share-heading" className="rounded-lg border border-border bg-card p-4">
      <h2 id="share-heading" className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        Share trip
      </h2>

      {!isSharedVisibility ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Sharing is available only for trips with <code>shared</code> visibility. Enable it to create
            invite links; those links show the trip profile and route to signed-in visitors.
          </p>
          <Button size="sm" onClick={() => void handleMakeShared()} disabled={busy} aria-busy={busy}>
            <ShieldCheck className="h-4 w-4 mr-2" aria-hidden />
            Enable sharing
          </Button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Anyone you give a link to can view this trail while signed in.
            </p>
            <Button size="sm" onClick={() => void handleCreate()} disabled={busy} aria-busy={busy}>
              <Share2 className="h-4 w-4 mr-2" aria-hidden />
              {busy ? 'Creating…' : 'Create link'}
            </Button>
          </div>

          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No share links yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {links.map(link => (
                <li key={link.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <a
                    href={shareUrl(link.token)}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                    {link.token.slice(0, 12)}…
                  </a>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void copyLink(link.token)}
                      aria-label="Copy share link"
                    >
                      <Copy className="h-4 w-4" aria-hidden />
                      {copied === link.token ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Revoke share link"
                      disabled={busy}
                      onClick={() => void handleRevoke(link.id)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Or make the trail <code>public</code> in the edit form to let anyone view it without a link.
          </p>
          {isPublicVisibility && publicUrl && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              View the public trail page
            </a>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
