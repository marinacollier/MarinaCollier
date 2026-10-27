/**
 * Collections that hold intimate writing (Ateliê Literário, later the private journal). They live only on this
 * device: the cloud sync never uploads them and never applies remote rows to them. They stay in her backup file
 * (her own copy) so a restore never loses a text.
 */
export const PRIVATE_COLLECTIONS: ReadonlySet<string> = new Set(['literaryWorks', 'literaryVersions', 'literaryCollections'])

export const isPrivateCollection = (key: string): boolean => PRIVATE_COLLECTIONS.has(key)
