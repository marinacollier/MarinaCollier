import { describe, expect, it } from 'vitest'
import { emptyDB } from '../defaults'
import type { DB } from '../types'
import { syncCollections } from './engine'

describe('private writing never syncs', () => {
  it('literary collections are left out of the cloud', () => {
    const db = { ...emptyDB(), literaryWorks: [], literaryVersions: [], literaryCollections: [] } as unknown as DB
    const keys = syncCollections(db)
    expect(keys).toContain('tasks')
    for (const k of ['literaryWorks', 'literaryVersions', 'literaryCollections']) expect(keys).not.toContain(k)
  })
})
