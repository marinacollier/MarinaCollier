import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { actions, getDB, hydrate } from '../store'
import { createMemoryAdapter } from '../storage'
import { buildSeed } from '../seed'
import { weekProgress } from './activities'
import {
  approvalIntact,
  approvePost,
  blockedTermsIn,
  canCopy,
  createPost,
  markPublished,
  normalizeBody,
  parsePostUrl,
  reopenDraft,
  reviewBlockers,
  savePost,
  sendToReview,
  sha256Hex,
  textToPublish,
} from './posts'

const MON = '2026-10-12'
const OK_CHECKS = { ndaOk: true, claimsVerified: true }
const URL_OK = 'https://www.linkedin.com/posts/marinacollieramelo_ai-products-activity-7380000000000000000-AbCd'

beforeEach(async () => {
  await hydrate(createMemoryAdapter())
  actions.replaceDB(buildSeed('2026-10-09'))
})

const post = () => getDB().execPosts[0]

async function approved(body = 'From conversational AI in 2017 to AI products today.') {
  createPost({ title: 'Tese IA', body, checks: OK_CHECKS })
  expect(sendToReview(post().id, []).ok).toBe(true)
  expect((await approvePost(post().id, [])).ok).toBe(true)
  return post()
}

describe('normalize, hash and blocked terms', () => {
  it('normalizes line breaks and trailing spaces only', () => {
    expect(normalizeBody('  a  \r\nb\t\r\n\n c ')).toBe('a\nb\n\n c')
  })

  it('hashes with SHA-256', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('finds blocked terms ignoring case and accents, as whole words', () => {
    expect(blockedTermsIn('Projeto no BANCO ACME e na Acmé', ['Acme'])).toEqual(['Acme'])
    expect(blockedTermsIn('Acmeville is fine', ['Acme'])).toEqual([])
    expect(blockedTermsIn('nada aqui', ['', '  '])).toEqual([])
  })

  it('lists every blocker before review', () => {
    expect(reviewBlockers({ body: '', checks: { ndaOk: false, claimsVerified: false } }, [])).toHaveLength(3)
    expect(reviewBlockers({ body: 'x'.repeat(3001), checks: OK_CHECKS }, [])[0]).toMatch(/3\.000/)
    expect(reviewBlockers({ body: 'Trabalho com a Acme', checks: OK_CHECKS }, ['acme'])[0]).toMatch(/termo bloqueado/)
    expect(reviewBlockers({ body: 'ok', checks: OK_CHECKS }, ['acme'])).toEqual([])
  })
})

describe('approval gate', () => {
  it('starts as idea without text, draft with text', () => {
    createPost({ title: 'Sem texto' })
    createPost({ title: 'Com texto', body: 'oi' })
    expect(getDB().execPosts.map((p) => p.status)).toEqual(['ideia', 'rascunho'])
  })

  it('will not go to review or be approved with blockers', async () => {
    createPost({ title: 'X', body: 'Cliente Acme', checks: OK_CHECKS })
    expect(sendToReview(post().id, ['Acme']).ok).toBe(false)
    expect(post().status).toBe('rascunho')
    // Term added after it went to review: approval re-checks.
    savePost(post().id, { body: 'Texto limpo' })
    expect(sendToReview(post().id, []).ok).toBe(true)
    const r = await approvePost(post().id, ['limpo'])
    expect(r.ok).toBe(false)
    expect(post().status).toBe('revisao')
  })

  it('approval stores the exact normalized text and its hash', async () => {
    const p = await approved('Linha 1  \nLinha 2')
    expect(p.status).toBe('aprovado')
    expect(p.approval?.bodySnapshot).toBe('Linha 1\nLinha 2')
    expect(p.approval?.bodyHash).toBe(await sha256Hex('Linha 1\nLinha 2'))
    expect(canCopy(p)).toBe(true)
    expect(textToPublish(p)).toBe('Linha 1\nLinha 2')
  })

  it('any change to the text drops the approval; whitespace-only changes do not', async () => {
    await approved('Texto aprovado')
    expect(savePost(post().id, { body: 'Texto aprovado   \n' }).invalidated).toBe(false)
    expect(post().status).toBe('aprovado')
    const r = savePost(post().id, { body: 'Texto aprovado!' })
    expect(r.invalidated).toBe(true)
    expect(post().status).toBe('rascunho')
    expect(post().approval).toBeUndefined()
    expect(canCopy(post())).toBe(false)
    expect(textToPublish(post())).toBeUndefined()
    r.undo()
    expect(post().status).toBe('aprovado')
    expect(approvalIntact(post())).toBe(true)
  })

  it('editing a post in review sends it back to draft', async () => {
    createPost({ title: 'X', body: 'v1', checks: OK_CHECKS })
    sendToReview(post().id, [])
    savePost(post().id, { body: 'v2' })
    expect(post().status).toBe('rascunho')
  })

  it('reopening an approved post removes the approval (undoable)', async () => {
    await approved()
    const undo = reopenDraft(post().id)
    expect(post().status).toBe('rascunho')
    expect(post().approval).toBeUndefined()
    undo()
    expect(post().status).toBe('aprovado')
  })
})

describe('post URL', () => {
  it('accepts post, feed update and article links and extracts the URN', () => {
    expect(parsePostUrl(URL_OK)).toEqual({ ok: true, url: URL_OK, urn: 'urn:li:activity:7380000000000000000' })
    expect(parsePostUrl('https://www.linkedin.com/feed/update/urn:li:share:123/?utm=x')).toEqual({
      ok: true,
      url: 'https://www.linkedin.com/feed/update/urn:li:share:123',
      urn: 'urn:li:share:123',
    })
    expect(parsePostUrl('https://br.linkedin.com/pulse/ai-products-marina').ok).toBe(true)
  })

  it('rejects profiles, other domains and junk', () => {
    expect(parsePostUrl('https://www.linkedin.com/in/marinacollieramelo/')).toMatchObject({ ok: false, reason: expect.stringMatching(/perfil/) })
    expect(parsePostUrl('https://linkedin.com.evil.io/posts/x-activity-1-a').ok).toBe(false)
    expect(parsePostUrl('linkedin post').ok).toBe(false)
  })
})

describe('publishing', () => {
  it('only an approved, unchanged text can be registered', async () => {
    createPost({ title: 'X', body: 'oi', checks: OK_CHECKS })
    expect(markPublished(post().id, { url: URL_OK, date: MON, matchesApproved: true }).ok).toBe(false)
  })

  it('registers the URL and counts one post on the career week; undo reverts both', async () => {
    await approved()
    const before = weekProgress(getDB(), MON).find((p) => p.kind === 'post')!.done
    const r = markPublished(post().id, { url: URL_OK, date: MON, matchesApproved: true })
    expect(r.ok).toBe(true)
    expect(post().status).toBe('publicado')
    expect(post().publication).toMatchObject({ publishedOn: MON, urn: 'urn:li:activity:7380000000000000000', matchesApproved: true })
    expect(weekProgress(getDB(), MON).find((p) => p.kind === 'post')!.done).toBe(before + 1)
    if (r.ok) r.undo()
    expect(post().status).toBe('aprovado')
    expect(weekProgress(getDB(), MON).find((p) => p.kind === 'post')!.done).toBe(before)
  })

  it('keeps the text that went out when it differs from the approved one', async () => {
    await approved()
    markPublished(post().id, { url: URL_OK, date: MON, matchesApproved: false, finalBody: 'versão editada no LinkedIn' })
    expect(post().publication).toMatchObject({ matchesApproved: false, finalBody: 'versão editada no LinkedIn' })
  })

  it('refuses a URL already registered on another post', async () => {
    await approved()
    markPublished(post().id, { url: URL_OK, date: MON, matchesApproved: true })
    createPost({ title: 'Outro', body: 'segundo', checks: OK_CHECKS })
    const second = getDB().execPosts[1]
    sendToReview(second.id, [])
    await approvePost(second.id, [])
    const r = markPublished(second.id, { url: URL_OK, date: MON, matchesApproved: true })
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/já está registrado/) })
  })
})
