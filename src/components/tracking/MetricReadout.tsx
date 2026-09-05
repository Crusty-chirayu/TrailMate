import { cn } from '@/lib/utils'

interface MetricReadoutProps {
  label: string
  value: string
  unit?: string
  accent?: boolean
  className?: string
}

/** A single large numeric readout styled like instrument instrumentation. */
export default function MetricReadout({ label, value, unit, accent, className }: MetricReadoutProps) {
  return (
    <div className={cn('flex flex-col justify-center gap-1 px-3 py-3', className)}>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span
        className={cn(
          'font-mono text-2xl font-semibold leading-none tabular-nums sm:text-3xl',
          accent ? 'text-emerald-400' : 'text-foreground',
        )}
      >
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>}
      </span>
    </div>
  )
}