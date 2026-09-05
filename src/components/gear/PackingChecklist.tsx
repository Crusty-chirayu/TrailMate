'use client'

// Packing checklist — the flagship Gear UI.
// Designed for one-handed use while physically packing: large tap targets,
// instant optimistic toggling with rollback on failure, category grouping,
// sticky progress header. No dialogs for the pack/unpack action.

import { useOptimistic, useState, useCallback, startTransition } from 'react'
import type { PackingItem, PackingProgress } from '@/types/domain'
import { groupByCategory, computePackingProgress, formatWeight } from '@/lib/domain/gear/progress'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { cn } from '@/lib/utils'

interface PackingChecklistProps {
  tripId: string
  initialItems: PackingItem[]
  onToggle: (tripId: string, itemId: string, packed: boolean) => Promise<void>
  onRemove?: (tripId: string, itemId: string) => Promise<void>
}

export function PackingChecklist({ tripId, initialItems, onToggle, onRemove }: PackingChecklistProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Optimistic packed-state overlay; reconciled by the server action result.
  const [items, applyOptimistic] = useOptimistic(
    initialItems,
    (state: PackingItem[], update: { id: string; packed: boolean }) =>
      state.map(item =>
        item.id === update.id
          ? { ...item, packed: update.packed, packedAt: update.packed ? new Date() : undefined }
          : item,
      ),
  )

  const handleToggle = useCallback(
    (item: PackingItem) => {
      const next = !item.packed
      setError(null)
      startTransition(async () => {
        applyOptimistic({ id: item.id, packed: next })
        try {
          await onToggle(tripId, item.id, next)
        } catch {
          setError(`Could not save "${item.itemName}" — try again.`)
        }
      })
    },
    [applyOptimistic, onToggle, tripId],
  )

  const handleRemove = useCallback(
    (item: PackingItem) => {
      if (!onRemove) return
      setError(null)
      startTransition(async () => {
        try {
          await onRemove(tripId, item.id)
        } catch {
          setError(`Could not remove "${item.itemName}" — try again.`)
        }
      })
    },
    [onRemove, tripId],
  )

  const toggleCollapse = (label: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })

  // Derived values are computed from the (optimistically-updated) array —
  // single pass per render, no per-item memoization needed at this scale.
  const progress: PackingProgress = computePackingProgress(items)
  const groups = groupByCategory(items)

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-10 text-center">
        <p className="font-medium mb-1">Nothing to pack yet</p>
        <p className="text-sm text-muted-foreground">Assign a gear template or add items below.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-2xl font-bold tabular-nums">
            {progress.packedItems} / {progress.totalItems}
            <span className="text-sm font-medium text-muted-foreground ml-2">packed · {progress.percentage}%</span>
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatWeight(progress.packedWeight)} / {formatWeight(progress.totalWeight)}
          </span>
        </div>
        <Progress value={progress.percentage} className="h-2" aria-label={`Packing progress ${progress.percentage}%`} />
        <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          {progress.requiredItems === 0
            ? 'No required items marked'
            : progress.requiredPacked === progress.requiredItems
              ? 'All required gear packed'
              : `Required: ${progress.requiredPacked}/${progress.requiredItems} · Optional: ${progress.optionalPacked}/${progress.optionalItems}`}
        </p>
        {error && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <CategoryGroups
        groups={groups}
        collapsed={collapsed}
        toggleCollapse={toggleCollapse}
        onToggle={handleToggle}
        onRemove={handleRemove}
      />
      <p className="sr-only" aria-live="polite">
        {progress.percentage}% packed, {progress.totalItems - progress.packedItems} items remaining.
      </p>
      <input type="hidden" name="tripId" value={tripId} />
    </div>
  )
}

// --- Category group rendering (kept outside the main component to keep the
// checklist body simple; still re-renders only when items/collapse change). ---

interface CategoryGroupView<T> {
  label: string
  items: T[]
}

function CategoryGroups({
  groups,
  collapsed,
  toggleCollapse,
  onToggle,
  onRemove,
}: {
  groups: ReadonlyArray<CategoryGroupView<PackingItem>>
  collapsed: Set<string>
  toggleCollapse: (label: string) => void
  onToggle: (item: PackingItem) => void
  onRemove: (item: PackingItem) => void
}) {
  return groups.map(group => {
    const isCollapsed = collapsed.has(group.label)
    const groupProgress = computePackingProgress(group.items)
    return (
      <section key={group.label} aria-labelledby={`cat-${group.label.replace(/\s+/g, '-')}`}>
        <button
          type="button"
          onClick={() => toggleCollapse(group.label)}
          aria-expanded={!isCollapsed}
          className="flex w-full items-center justify-between py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <span
            id={`cat-${group.label.replace(/\s+/g, '-')}`}
            className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {group.label}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {groupProgress.packedItems}/{groupProgress.totalItems}
            {groupProgress.totalWeight > 0 && <> · {formatWeight(groupProgress.totalWeight)}</>}
          </span>
        </button>
        {!isCollapsed && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {group.items.map(item => (
              <li key={item.id}>
                <div
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 min-h-[56px]',
                    item.packed && 'bg-muted/40',
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={item.packed}
                    aria-label={`${item.packed ? 'Unpack' : 'Pack'} ${item.itemName}`}
                    onClick={() => onToggle(item)}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      item.packed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40 bg-background hover:border-primary',
                    )}
                  >
                    {item.packed && (
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
                        <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-medium',
                        item.packed && 'line-through text-muted-foreground',
                      )}
                    >
                      {item.itemName}
                      {item.quantity > 1 && (
                        <span className="text-muted-foreground font-normal"> ×{item.quantity}</span>
                      )}
                    </span>
                    {(item.notes || item.weight != null) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.weight != null && <>{formatWeight(item.weight * item.quantity)} · </>}
                        {item.notes}
                      </span>
                    )}
                  </div>
                  {item.required ? (
                    <span className="shrink-0 rounded border border-amber-600/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Req
                    </span>
                  ) : (
                    <span className="shrink-0 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                      Opt
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${item.itemName} from packing list`}
                    onClick={() => onRemove(item)}
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
    })
}