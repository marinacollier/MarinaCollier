/** Export of one version: TXT and Markdown (line breaks kept), file names without accents. */
import type { LiteraryWork } from '@/data/types'
import { cleanText } from './model'

export function slug(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'texto'
  )
}

export function toTxt(work: Pick<LiteraryWork, 'title' | 'subtitle'>, body: string): string {
  const head = work.subtitle ? `${work.title}\n${work.subtitle}` : work.title
  return `${head}\n\n${cleanText(body)}\n`
}

/** Markdown keeps every line break of a poem (two trailing spaces = hard break); blank lines stay stanzas. */
export function toMarkdown(work: Pick<LiteraryWork, 'title' | 'subtitle'>, body: string): string {
  const lines = cleanText(body)
    .split('\n')
    .map((l, i, all) => (l && all[i + 1] ? `${l.replace(/^([#>*+-]|\d+\.)/, '\\$1')}  ` : l.replace(/^([#>*+-]|\d+\.)/, '\\$1')))
  return [`# ${work.title}`, work.subtitle ? `\n*${work.subtitle}*` : '', '', ...lines].join('\n') + '\n'
}
