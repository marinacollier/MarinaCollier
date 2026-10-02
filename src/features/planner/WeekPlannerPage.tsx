import { EmptyState, Page, PageHeader } from '@/components/ui'

// STUB — replaced by the Planner agent.
export default function WeekPlannerPage() {
  return (
    <Page>
      <PageHeader title="Montar minha semana" back />
      <EmptyState emoji="🗓️" title="Em construção" />
    </Page>
  )
}
