import { useMemo, useState } from 'react'
import { useDB } from '@/data/store'
import { checkinFor } from '@/data/selectors'
import { closeSheet, toast } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { SheetLayout, TextArea } from '@/components/ui'
import { relativeDay, todayKey } from '@/lib/date'
import { CheckinFields } from './components'
import { upsertCheckin } from './mutations'

export default function CheckinSheet({ date }: SheetProps<'checkin'>) {
  const day = date ?? todayKey()
  const db = useDB()
  const checkin = useMemo(() => checkinFor(db, day), [db, day])
  const [nota, setNota] = useState(checkin?.nota ?? '')

  const done = () => {
    if ((checkin?.nota ?? '') !== nota.trim()) upsertCheckin(day, { nota: nota.trim() || undefined })
    toast('Check-in anotado 🌿')
    closeSheet()
  }

  return (
    <SheetLayout eyebrow={relativeDay(day)} title="Como você está?" onClose={closeSheet} primary={{ label: 'Pronto', onClick: done }}>
      <p className="text-[13.5px] text-muted -mt-1">Toque no que fizer sentido. Nada é obrigatório.</p>
      <CheckinFields date={day} checkin={checkin} showNote={false} />
      <TextArea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} placeholder="uma nota sobre o dia (opcional)" />
    </SheetLayout>
  )
}
