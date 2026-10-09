import { persist, useStore } from '@/data/store'

/** Shown only while the last save to the device failed. Never silent, never in the way. */
export function SaveFailedBanner() {
  const failed = useStore((s) => s.saveFailed)
  if (!failed) return null
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-50 px-4 pt-[max(env(safe-area-inset-top),0.5rem)]">
      <div className="mx-auto max-w-md rounded-2xl bg-sand-soft text-ink px-3.5 py-2.5 text-[13.5px] leading-snug shadow-sm flex items-center gap-3">
        <span className="flex-1">Não consegui salvar no aparelho. As últimas mudanças podem se perder se você fechar o app.</span>
        <button type="button" onClick={() => void persist()} className="shrink-0 font-semibold underline min-h-9">
          Tentar de novo
        </button>
      </div>
    </div>
  )
}
