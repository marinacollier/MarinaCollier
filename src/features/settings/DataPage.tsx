import { EmptyState, Page, PageHeader } from '@/components/ui'

// STUB — replaced by the owning feature agent.
export default function DataPage() {
  return (
    <Page>
      <PageHeader title="Meus dados" />
      <EmptyState emoji="🌱" title="Em construção" text="Essa área chega já já." />
    </Page>
  )
}
