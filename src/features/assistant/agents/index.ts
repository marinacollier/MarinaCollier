import type { Agent } from '../types'
import { CalendarAgent } from './CalendarAgent'
import { FinanceAgent } from './FinanceAgent'
import { LearningAgent } from './LearningAgent'
import { LifeAdminAgent } from './LifeAdminAgent'
import { TrainingAgent } from './TrainingAgent'
import { TravelAgent } from './TravelAgent'
import { WorkAgent } from './WorkAgent'

export { CalendarAgent, FinanceAgent, LearningAgent, LifeAdminAgent, TrainingAgent, TravelAgent, WorkAgent }

/** Order matters only for ties (earlier wins). */
export const AGENTS: Agent[] = [TravelAgent, WorkAgent, FinanceAgent, TrainingAgent, LearningAgent, LifeAdminAgent, CalendarAgent]
