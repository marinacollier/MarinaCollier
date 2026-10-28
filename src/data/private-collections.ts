/**
 * Collections that hold intimate writing (Ateliê Literário, later the private journal). They never go to the
 * Supabase sync. Inside the Claude Artifact they DO sync to her owner-only store by default (the Claude app wipes
 * the device storage; without it her texts would be lost) — she can turn that off (profile.privateWritingCloud).
 * They also stay in her backup file.
 */
export const PRIVATE_COLLECTIONS: ReadonlySet<string> = new Set(['literaryWorks', 'literaryVersions', 'literaryCollections', 'literaryProfile'])

export const isPrivateCollection = (key: string): boolean => PRIVATE_COLLECTIONS.has(key)
