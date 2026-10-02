/**
 * São Paulo date/time from an instant. Copy of the relevant part of src/integrations/tz.ts
 * (Deno cannot import the app's `@/` modules). Pure, no Deno APIs.
 */
const SP = 'America/Sao_Paulo'

const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: SP, year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: SP, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function toSaoPaulo(d: Date): { date: string; time: string } {
  return { date: dateFmt.format(d), time: timeFmt.format(d) }
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

/** 'YYYY-MM-DD' (São Paulo) → ISO instant at local midnight. São Paulo is UTC-3 (no DST since 2019). */
export function spMidnightISO(key: string): string {
  return new Date(`${key}T00:00:00-03:00`).toISOString()
}
