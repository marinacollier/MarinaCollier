import { describe, expect, it } from 'vitest'
import { emptyDB } from '../defaults'
import type { DB } from '../types'
import { syncCollections } from './engine'

describe('private writing', () => {
  const db = { ...emptyDB(), literaryWorks: [], literaryVersions: [], literaryCollections: [] } as unknown as DB

  it('is left out of the cloud by default (Supabase sync)', () => {
    const keys = syncCollections(db)
    expect(keys).toContain('tasks')
    for (const k of ['literaryWorks', 'literaryVersions', 'literaryCollections']) expect(keys).not.toContain(k)
  })

  it('goes to her owner-only Claude store when included (survives the app wiping the device)', () => {
    const keys = syncCollections(db, true)
    for (const k of ['tasks', 'literaryWorks', 'literaryVersions', 'literaryCollections']) expect(keys).toContain(k)
  })
})
