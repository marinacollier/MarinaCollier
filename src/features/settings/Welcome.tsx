import { actions } from '@/data/store'
import { Button } from '@/components/ui'

// STUB — replaced by the Settings & Platform agent.
export default function Welcome() {
  return (
    <div className="fixed inset-0 z-[100] bg-bg flex flex-col items-center justify-center p-8 text-center">
      <h1 className="font-display text-3xl">Oi, Marina. Esse é o seu espaço.</h1>
      <Button className="mt-8" onClick={() => actions.setProfile({ onboardedAt: new Date().toISOString() })}>
        Entrar no meu dia
      </Button>
    </div>
  )
}
