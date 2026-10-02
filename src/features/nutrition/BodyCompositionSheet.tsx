import { closeSheet } from '@/app/ui-store'
import type { SheetProps } from '@/app/sheet-types'
import { EmptyState, SheetLayout } from '@/components/ui'

// STUB — replaced by the Nutrition agent.
export default function BodyCompositionSheet(_props: SheetProps<'bodyComposition'>) {
  return (
    <SheetLayout title="Em breve" onClose={closeSheet}>
      <EmptyState emoji="🌱" title="Em construção" compact />
    </SheetLayout>
  )
}
