/** Exact sentence (section 1) for any option that isn't one of the nutritionist's substitutions. */
export const NOT_PRESCRIBED =
  'Essa opção não está cadastrada como substituição pelo seu nutricionista. Posso sugerir uma alternativa aproximada, mas não vou tratá-la como equivalente ao plano.'

/** Default weekly plan payload (create lazily, on first interaction). */
export function emptyPlanData(weekStart: string, by: 'lumos' | 'marina' = 'marina') {
  return { weekStart, choices: {} as Record<string, string>, pantry: [] as string[], checked: [] as string[], pots: {} as Record<string, 'geladeira' | 'freezer' | 'consumido'>, by }
}
