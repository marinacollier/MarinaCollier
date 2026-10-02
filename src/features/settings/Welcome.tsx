import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { actions, useDB } from '@/data/store'
import { nowISO } from '@/lib/id'
import { haptic } from '@/lib/haptics'
import { AppMark } from './components'

/**
 * First run. Two beats on one screen: the greeting, then the promise.
 * The button is present from the start (it fades in with beat 2) so it is always reachable.
 */
export default function Welcome() {
  const name = useDB((db) => db.profile.name) || 'Marina'
  const [beat, setBeat] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setBeat(1), 1100)
    return () => clearTimeout(t)
  }, [])

  const enter = () => {
    haptic('success')
    setLeaving(true)
    setTimeout(() => actions.setProfile({ onboardedAt: nowISO() }), 380)
  }

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-bg flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Boas-vindas"
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1, scale: leaving ? 1.02 : 1 }}
      transition={{ duration: 0.38, ease: 'easeOut' }}
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}
      onClick={() => setBeat(1)}
    >
      {/* warm glow behind the sun */}
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-[22%] -translate-x-1/2 h-[420px] w-[420px] rounded-full bg-accent-soft blur-3xl"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.85, scale: 1 }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />

      <div className="relative flex-1 flex flex-col items-center justify-center px-8 text-center">
        <AppMark size={128} animated />
        <motion.div
          className="eyebrow mt-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          MARINA OS
        </motion.div>
        <motion.h1
          className="font-display text-[34px] leading-[1.1] tracking-tight mt-3 max-w-[16ch]"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7, ease: 'easeOut' }}
        >
          Oi, {name}. Esse é o seu espaço.
        </motion.h1>
        <div className="min-h-[96px] mt-4">
          <AnimatePresence>
            {beat >= 1 && (
              <motion.p
                className="text-[17px] text-ink-2 leading-relaxed max-w-[30ch]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              >
                Já organizei uma primeira versão da sua vida aqui. Você muda o que quiser.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <motion.div
        className="relative px-6 w-full max-w-[440px] mx-auto"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.6, ease: 'easeOut' }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            enter()
          }}
          className="w-full h-14 rounded-2xl bg-ink text-bg text-[17px] font-medium active:scale-[0.98] transition-transform shadow-lg"
        >
          Entrar no meu dia
        </button>
        <p className="text-center text-[12.5px] text-muted mt-3">em constante movimento: corpo, mente e vida.</p>
      </motion.div>
    </motion.div>
  )
}
