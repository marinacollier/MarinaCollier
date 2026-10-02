import type { Agent } from '../types'
import { CalendarAgent } from './CalendarAgent'
import { FinanceAgent } from './FinanceAgent'
import { FuelAgent } from './FuelAgent'
import { LearningAgent } from './LearningAgent'
import { LifeAdminAgent } from './LifeAdminAgent'
import { PlanningAgent } from './PlanningAgent'
import { TrainingAgent } from './TrainingAgent'
import { TravelAgent } from './TravelAgent'
import { WorkAgent } from './WorkAgent'

export { CalendarAgent, FinanceAgent, FuelAgent, LearningAgent, LifeAdminAgent, PlanningAgent, TrainingAgent, TravelAgent, WorkAgent }

/** Order matters only for ties (earlier wins). */
export const AGENTS: Agent[] = [PlanningAgent, FuelAgent, TravelAgent, WorkAgent, FinanceAgent, TrainingAgent, LearningAgent, LifeAdminAgent, CalendarAgent]
