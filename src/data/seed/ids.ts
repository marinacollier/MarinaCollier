/**
 * Stable ids for seed records that other seeds or code need to reference.
 * Feature seeds may create other records with random ids.
 */
export const SEED_IDS = {
  // projects
  projSantander: 'proj-santander',
  projFashionFinder: 'proj-fashionfinder',
  projDayOne: 'proj-dayone',
  projYoga: 'proj-yoga',
  projUGC: 'proj-ugc',
  // trips
  tripRecife: 'trip-recife',
  tripAfrica: 'trip-africa-do-sul',
  tripItacare: 'trip-itacare',
  // routines
  routineMorning: 'routine-manha',
  // pets
  petLuna: 'pet-luna',
  // calendar
  sourceLocal: 'cal-local',
  // study tracks
  trackIngles: 'track-ingles',
  trackPos: 'track-pos',
  trackProduto: 'track-produto',
  trackIA: 'track-ia',
  trackTecnologia: 'track-tecnologia',
  trackLideranca: 'track-lideranca',
  trackCursos: 'track-cursos',
} as const

const STABLE_SEED_IDS = new Set<string>([...Object.values(SEED_IDS), 'goal-africa-pronta'])

/** Ids only the seed produces: 'seed:<area>:<slug>' and the named SEED_IDS (+ default categories). */
export function isSeedRecordId(id: string): boolean {
  return id.startsWith('seed:') || STABLE_SEED_IDS.has(id)
}
