import { EmptyState, Page, PageHeader } from '@/components/ui'

// STUB — replaced by the owning feature agent.
export default function TasksPage() {
  return (
    <Page>
      <PageHeader title="Tarefas" />
      <EmptyState emoji="🌱" title="Em construção" text="Essa área chega já já." />
    </Page>
  )
}
