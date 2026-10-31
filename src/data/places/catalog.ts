/**
 * Reference data for "Lugares que conheci": the 27 Brazilian federative units (26 states + DF) with a tile-grid
 * position for the small map, their capitals (so "fui pra Recife" knows it is PE), and country names/flags from
 * ISO-2 codes (Intl, pt-BR). No map library, no network.
 */
import { normalize } from '@/lib/text'

export interface UF {
  uf: string
  name: string
  capital: string
  /** Tile-grid column/row (7 columns × 7 rows, roughly geographic). */
  col: number
  row: number
}

export const BR_UFS: UF[] = [
  { uf: 'RR', name: 'Roraima', capital: 'Boa Vista', col: 1, row: 0 },
  { uf: 'AP', name: 'Amapá', capital: 'Macapá', col: 3, row: 0 },
  { uf: 'AM', name: 'Amazonas', capital: 'Manaus', col: 1, row: 1 },
  { uf: 'PA', name: 'Pará', capital: 'Belém', col: 2, row: 1 },
  { uf: 'MA', name: 'Maranhão', capital: 'São Luís', col: 3, row: 1 },
  { uf: 'CE', name: 'Ceará', capital: 'Fortaleza', col: 4, row: 1 },
  { uf: 'RN', name: 'Rio Grande do Norte', capital: 'Natal', col: 5, row: 1 },
  { uf: 'AC', name: 'Acre', capital: 'Rio Branco', col: 0, row: 2 },
  { uf: 'RO', name: 'Rondônia', capital: 'Porto Velho', col: 1, row: 2 },
  { uf: 'MT', name: 'Mato Grosso', capital: 'Cuiabá', col: 2, row: 2 },
  { uf: 'TO', name: 'Tocantins', capital: 'Palmas', col: 3, row: 2 },
  { uf: 'PI', name: 'Piauí', capital: 'Teresina', col: 4, row: 2 },
  { uf: 'PE', name: 'Pernambuco', capital: 'Recife', col: 5, row: 2 },
  { uf: 'PB', name: 'Paraíba', capital: 'João Pessoa', col: 6, row: 2 },
  { uf: 'MS', name: 'Mato Grosso do Sul', capital: 'Campo Grande', col: 2, row: 3 },
  { uf: 'GO', name: 'Goiás', capital: 'Goiânia', col: 3, row: 3 },
  { uf: 'BA', name: 'Bahia', capital: 'Salvador', col: 4, row: 3 },
  { uf: 'SE', name: 'Sergipe', capital: 'Aracaju', col: 5, row: 3 },
  { uf: 'AL', name: 'Alagoas', capital: 'Maceió', col: 6, row: 3 },
  { uf: 'PR', name: 'Paraná', capital: 'Curitiba', col: 2, row: 4 },
  { uf: 'DF', name: 'Distrito Federal', capital: 'Brasília', col: 3, row: 4 },
  { uf: 'MG', name: 'Minas Gerais', capital: 'Belo Horizonte', col: 4, row: 4 },
  { uf: 'ES', name: 'Espírito Santo', capital: 'Vitória', col: 5, row: 4 },
  { uf: 'SC', name: 'Santa Catarina', capital: 'Florianópolis', col: 2, row: 5 },
  { uf: 'SP', name: 'São Paulo', capital: 'São Paulo', col: 3, row: 5 },
  { uf: 'RJ', name: 'Rio de Janeiro', capital: 'Rio de Janeiro', col: 4, row: 5 },
  { uf: 'RS', name: 'Rio Grande do Sul', capital: 'Porto Alegre', col: 2, row: 6 },
]

export const BR_UF_TOTAL = BR_UFS.length // 27, DF included

const UF_BY_CODE = new Map(BR_UFS.map((u) => [u.uf, u]))
export const ufInfo = (uf: string | undefined): UF | undefined => (uf ? UF_BY_CODE.get(uf.toUpperCase()) : undefined)
export const isUF = (s: string): boolean => UF_BY_CODE.has(s.toUpperCase())

/** "Maranhão" / "maranhao" → MA. */
export function ufByName(name: string): UF | undefined {
  const n = normalize(name)
  return BR_UFS.find((u) => normalize(u.name) === n)
}

/** "Recife" → PE (state capitals only). */
export function ufByCapital(name: string): UF | undefined {
  const n = normalize(name)
  return BR_UFS.find((u) => normalize(u.capital) === n)
}

// ─── Countries ─────────────────────────────────────────────────────────────

/** 🇿🇦 for 'ZA'. */
export function flagOf(code: string | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '🌍'
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** 🇿🇦 → 'ZA' (undefined for anything that isn't a flag). */
export function isoOfFlag(flag: string | undefined): string | undefined {
  if (!flag) return undefined
  const cps = [...flag].map((c) => c.codePointAt(0)!).filter((cp) => cp >= 0x1f1e6 && cp <= 0x1f1ff)
  if (cps.length !== 2) return undefined
  return String.fromCharCode(...cps.map((cp) => cp - 0x1f1e6 + 65))
}

const FALLBACK_NAMES: Record<string, string> = { BR: 'Brasil', PA: 'Panamá', ZA: 'África do Sul', PT: 'Portugal', AR: 'Argentina', CL: 'Chile', US: 'Estados Unidos' }

let display: Intl.DisplayNames | null | undefined
function displayNames(): Intl.DisplayNames | null {
  if (display === undefined) {
    try {
      display = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    } catch {
      display = null
    }
  }
  return display
}

/** 'ZA' → 'África do Sul'. */
export function countryName(code: string): string {
  const c = code.toUpperCase()
  try {
    const n = displayNames()?.of(c)
    if (n && n !== c) return n
  } catch {
    /* not a region code */
  }
  return FALLBACK_NAMES[c] ?? c
}

let countries: { code: string; name: string }[] | undefined
/** Every ISO-2 region Intl knows, sorted by pt-BR name (for the picker and name lookups). */
export function allCountries(): { code: string; name: string }[] {
  if (countries) return countries
  const out: { code: string; name: string }[] = []
  const dn = displayNames()
  const A = 65
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j)
      let name: string | undefined
      try {
        name = dn?.of(code)
      } catch {
        name = undefined
      }
      // Unknown / reserved codes come back as the code itself; skip continents/unions.
      if (!name || name === code || ['EU', 'EZ', 'UN', 'QO', 'XA', 'XB', 'ZZ'].includes(code)) continue
      out.push({ code, name })
    }
  if (!out.length) for (const [code, name] of Object.entries(FALLBACK_NAMES)) out.push({ code, name })
  countries = out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  return countries
}

/** Other ways she may write a country. */
const COUNTRY_ALIASES: Record<string, string> = {
  eua: 'US',
  usa: 'US',
  'estados unidos': 'US',
  inglaterra: 'GB',
  escocia: 'GB',
  'reino unido': 'GB',
  holanda: 'NL',
  'africa do sul': 'ZA',
  'south africa': 'ZA',
  panama: 'PA',
  brasil: 'BR',
}

/** "Panamá" / "panama" / "EUA" → ISO-2. */
export function countryByName(name: string): string | undefined {
  const n = normalize(name).replace(/^(o|a|os|as)\s+/, '')
  if (COUNTRY_ALIASES[n]) return COUNTRY_ALIASES[n]
  return allCountries().find((c) => normalize(c.name) === n)?.code
}
