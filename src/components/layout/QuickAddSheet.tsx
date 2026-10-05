import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/app/routes'
import { closeSheet, replaceSheet } from '@/app/ui-store'
import { SheetLayout } from '@/components/ui'
import { todayKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import type { SheetName, SheetProps } from '@/app/sheet-types'

interface Option {
  label: string
  emoji: string
  open: () => void
}

function go<N extends SheetName>(name: N, props?: SheetProps<N>) {
  return () => {
    haptic('light')
    replaceSheet(name, props)
  }
}

const OPTIONS: Option[] = [
  { label: 'Inbox', emoji: '🧠', open: go('brainDump') },
  { label: 'Tarefa', emoji: '✓', open: go('task', { defaults: { date: todayKey() } }) },
  { label: 'Gasto', emoji: '💸', open: go('expense') },
  { label: 'Refeição', emoji: '🥗', open: go('meal') },
  { label: 'Treino', emoji: '🏃‍♀️', open: go('workout') },
  { label: 'Nota', emoji: '📝', open: go('note', { kind: 'nota' }) },
  { label: 'Ideia', emoji: '💡', open: go('note', { kind: 'ideia' }) },
  { label: 'Meta', emoji: '🎯', open: go('goal') },
  { label: 'Estudo', emoji: '📚', open: go('study') },
  { label: 'Livro', emoji: '📖', open: go('book') },
  { label: 'Conteúdo', emoji: '🎬', open: go('content') },
  { label: 'Compra', emoji: '🛍️', open: go('expense', { defaults: { status: 'planned_purchase' } }) },
  { label: 'Viagem', emoji: '✈️', open: go('trip') },
  { label: 'Compromisso', emoji: '📅', open: go('event') },
  { label: 'Esperando', emoji: '⏳', open: go('task', { defaults: { status: 'waiting' } }) },
  { label: 'Win', emoji: '✨', open: go('win') },
]

/** Manual registration (fallback). The main path is telling Lumos — she files it in the right place. */
export default function QuickAddSheet() {
  const nav = useNavigate()
  return (
    <SheetLayout title="O que vamos registrar?" onClose={closeSheet}>
      <button
        onClick={() => {
          haptic('light')
          closeSheet()
          nav(ROUTES.assistant)
        }}
        className="w-full flex items-center gap-3 rounded-2xl bg-ink text-bg px-4 py-4 text-left active:scale-[0.99] transition"
      >
        <span className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
          <Sparkles size={20} />
        </span>
        <span>
          <span className="block font-display text-[19px] leading-tight">Conta pra Lumos</span>
          <span className="block text-[13px] opacity-70">ela entende e guarda no lugar certo</span>
        </span>
      </button>
      <div className="grid grid-cols-3 gap-2.5 pb-2">
        {OPTIONS.map((o, i) => (
          <motion.button
            key={o.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.015 }}
            onClick={o.open}
            className="flex flex-col items-center justify-center gap-1.5 h-[84px] rounded-2xl bg-surface-2 active:scale-[0.97] transition"
          >
            <span className="text-[22px]" aria-hidden>
              {o.emoji}
            </span>
            <span className="text-[13px] font-medium">{o.label}</span>
          </motion.button>
        ))}
      </div>
    </SheetLayout>
  )
}
