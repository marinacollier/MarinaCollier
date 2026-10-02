import { Plus } from 'lucide-react'

/** Square "+" submit button that sits next to a capture input (48px, same height as .input). */
export function SubmitIcon({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      disabled={disabled}
      className="h-12 w-12 shrink-0 rounded-2xl bg-ink text-bg inline-flex items-center justify-center transition active:scale-95 disabled:opacity-30"
    >
      <Plus size={20} />
    </button>
  )
}
