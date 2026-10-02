import { closeSheet } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { EmptyState, SheetLayout } from '@/components/ui'

// STUB — replaced by the owning feature agent.
export default function ExpenseSheet(_props: SheetProps<'expense'>) {
  return (
    <SheetLayout title="Em breve" onClose={closeSheet}>
      <EmptyState emoji="🌱" title="Em construção" compact />
    </SheetLayout>
  )
}
