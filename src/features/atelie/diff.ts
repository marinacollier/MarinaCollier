/**
 * Small LCS diff (no dependency) to compare two versions of a text.
 * - `diffWords`: word-level, whitespace and line breaks kept as their own tokens (a poem keeps its shape).
 * - `diffLines`: line-level, used automatically for long texts so the table stays small.
 */
export type DiffOp = 'same' | 'add' | 'del'
export interface DiffPart {
  op: DiffOp
  text: string
}

/** Above this many table cells we fall back to a line diff (keeps the phone responsive). */
const MAX_CELLS = 2_000_000

function lcs<T>(a: T[], b: T[]): DiffPart[] {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: { op: DiffOp; tok: T }[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', tok: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: 'del', tok: a[i++] })
    else out.push({ op: 'add', tok: b[j++] })
  }
  while (i < n) out.push({ op: 'del', tok: a[i++] })
  while (j < m) out.push({ op: 'add', tok: b[j++] })
  return out.map((x) => ({ op: x.op, text: String(x.tok) }))
}

/** Merges neighbours with the same op ("a"+"b" → "ab"). */
function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = []
  for (const p of parts) {
    const last = out.at(-1)
    if (last && last.op === p.op) last.text += p.text
    else out.push({ ...p })
  }
  return out
}

const tokenize = (s: string) => s.split(/(\s+)/).filter((t) => t !== '')

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)
  if ((a.length + 1) * (b.length + 1) > MAX_CELLS) return diffLines(before, after)
  return merge(lcs(a, b))
}

export function diffLines(before: string, after: string): DiffPart[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const parts = lcs(a, b).map((p) => ({ ...p, text: p.text + '\n' }))
  return merge(parts)
}

/** Words added / removed (whitespace not counted). */
export function diffStats(parts: DiffPart[]): { added: number; removed: number } {
  const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)
  return parts.reduce((s, p) => (p.op === 'add' ? { ...s, added: s.added + words(p.text) } : p.op === 'del' ? { ...s, removed: s.removed + words(p.text) } : s), { added: 0, removed: 0 })
}
