'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'all', label: 'All time' },
] as const

/**
 * Period picker for the expedition log. Plain links (natively keyboard
 * accessible, no focus traps) that re-render the server component with a
 * new `?window=` value. `aria-current` marks the active period.
 */
export default function WindowSelector() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = searchParams.get('window') ?? '30'

  return (
    <nav aria-label="Time period">
      <ul className="flex flex-wrap gap-1">
        {OPTIONS.map(option => {
          const active = current === option.value
          return (
            <li key={option.value}>
              <Link
                href={option.value === '30' ? pathname : `${pathname}?window=${option.value}`}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'inline-block rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {option.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
