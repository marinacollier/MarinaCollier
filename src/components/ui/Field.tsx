import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { centsToInput, parseBRL } from '@/lib/money'

export function Field({ label, hint, children, className }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="block text-[13px] font-medium text-ink-2 mb-1.5 px-0.5">{label}</span>}
      {children}
      {hint && <span className="block text-[12px] text-muted mt-1 px-0.5">{hint}</span>}
    </label>
  )
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('input', className)} {...rest} />
})

/** Big borderless title input used at the top of sheets ("O que precisa ser feito?"). */
export const TitleInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TitleInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cn('w-full bg-transparent outline-none font-display text-[22px] leading-tight placeholder:text-muted/70 py-1', className)}
      {...rest}
    />
  )
})

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn('input resize-none leading-relaxed', className)} {...rest} />
})

export interface MoneyInputProps {
  valueCents: number | undefined
  onChange: (cents: number | undefined) => void
  autoFocus?: boolean
  placeholder?: string
  className?: string
  large?: boolean
}

/** Decimal keypad on iPhone, accepts "12,50" / "1.234,56". */
export function MoneyInput({ valueCents, onChange, autoFocus, placeholder = '0,00', className, large }: MoneyInputProps) {
  const [text, setText] = useState(() => centsToInput(valueCents))
  return (
    <div className={cn('flex items-baseline gap-2', large ? 'py-1' : 'input', className)}>
      <span className={cn('text-muted', large ? 'font-display text-2xl' : '')}>R$</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseBRL(e.target.value))
        }}
        className={cn('flex-1 min-w-0 bg-transparent outline-none', large && 'font-display text-[34px] leading-none tracking-tight')}
      />
    </div>
  )
}

export function DateInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value?: string; onChange: (v: string | undefined) => void }) {
  return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={cn('input appearance-none min-h-12', className)} {...rest} />
}

export function TimeInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value?: string; onChange: (v: string | undefined) => void }) {
  return <input type="time" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className={cn('input appearance-none min-h-12', className)} {...rest} />
}

export function NumberInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <input
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => {
        const n = Number(e.target.value.replace(',', '.'))
        onChange(e.target.value === '' || !Number.isFinite(n) ? undefined : n)
      }}
      className={cn('input', className)}
      {...rest}
    />
  )
}

export function Select<T extends string>({ value, onChange, options, className, placeholder }: { value?: T; onChange: (v: T | undefined) => void; options: { value: T; label: string }[]; className?: string; placeholder?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value || undefined) as T | undefined)} className="input appearance-none pr-9 min-h-12">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
    </div>
  )
}

/** "mais opções" disclosure: secondary fields stay out of the way. */
export function MoreOptions({ children, label = 'mais opções', defaultOpen = false }: { children: ReactNode; label?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-[13px] text-muted h-10 px-0.5" aria-expanded={open}>
        <ChevronDown size={15} className={cn('transition-transform', open && 'rotate-180')} />
        {open ? 'menos opções' : label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="space-y-4 pt-1 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
