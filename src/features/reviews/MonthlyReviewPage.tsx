import { EmptyState, Page, PageHeader } from '@/components/ui'

// STUB — replaced by the owning feature agent.
export default function MonthlyReviewPage() {
  return (
    <Page>
      <PageHeader title="Meu mês" />
      <EmptyState emoji="🌱" title="Em construção" text="Essa área chega já já." />
    </Page>
  )
}
