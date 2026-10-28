/**
 * Optional forecast for the Expedição "Hoje" card — Open-Meteo (free, no key), read straight from the phone.
 * Nothing is stored: the card always shows the source and when it was fetched, and says "Sem previsão agora"
 * when the request fails (offline, blocked). Never a guessed value.
 */
import { useEffect, useState } from 'react'
import type { DateKey, TimeHM } from '@/data/types'

export interface ForecastDay {
  date: DateKey
  tMin?: number
  tMax?: number
  windMax?: number
  gustMax?: number
  rainProb?: number
  sunrise?: TimeHM
  sunset?: TimeHM
  waveMax?: number
}

export interface Forecast {
  source: 'Open-Meteo'
  fetchedAt: string
  current?: { temp?: number; wind?: number; gusts?: number }
  days: ForecastDay[]
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
/** '2026-10-28T05:41' → '05:41' (Open-Meteo already answers in the requested time zone). */
const hm = (v: unknown) => (typeof v === 'string' && /T\d{2}:\d{2}/.test(v) ? v.slice(11, 16) : undefined)

/** Pure: Open-Meteo forecast (+ optional marine) JSON → what the card shows. */
export function parseForecast(weather: unknown, marine: unknown, fetchedAt: string): Forecast {
  const w = (weather ?? {}) as { daily?: Record<string, unknown[]>; current?: Record<string, unknown> }
  const m = (marine ?? {}) as { daily?: Record<string, unknown[]> }
  const d = w.daily ?? {}
  const dates = (d.time ?? []) as string[]
  const waves = new Map(((m.daily?.time ?? []) as string[]).map((t, i) => [t, num(m.daily?.wave_height_max?.[i])]))
  return {
    source: 'Open-Meteo',
    fetchedAt,
    current: w.current ? { temp: num(w.current.temperature_2m), wind: num(w.current.wind_speed_10m), gusts: num(w.current.wind_gusts_10m) } : undefined,
    days: dates.map((date, i) => ({
      date,
      tMin: num(d.temperature_2m_min?.[i]),
      tMax: num(d.temperature_2m_max?.[i]),
      windMax: num(d.wind_speed_10m_max?.[i]),
      gustMax: num(d.wind_gusts_10m_max?.[i]),
      rainProb: num(d.precipitation_probability_max?.[i]),
      sunrise: hm(d.sunrise?.[i]),
      sunset: hm(d.sunset?.[i]),
      waveMax: waves.get(date),
    })),
  }
}

export function forecastUrls(lat: number, lon: number, timeZone: string): { weather: string; marine: string } {
  const tz = encodeURIComponent(timeZone)
  return {
    weather:
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=${tz}&forecast_days=3` +
      '&current=temperature_2m,wind_speed_10m,wind_gusts_10m' +
      '&daily=temperature_2m_min,temperature_2m_max,wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max,sunrise,sunset',
    marine: `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&timezone=${tz}&forecast_days=3&daily=wave_height_max`,
  }
}

async function getJSON(url: string, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// One fetch per place every 30 min while the app is open (memory only).
const cache = new Map<string, { at: number; data: Forecast }>()
const FRESH_MS = 30 * 60 * 1000

export type ForecastState = { status: 'loading' } | { status: 'ok'; data: Forecast } | { status: 'none' }

export function useForecast(point: { lat: number; lon: number } | undefined, timeZone: string): ForecastState {
  const key = point ? `${point.lat},${point.lon},${timeZone}` : ''
  const cached = key ? cache.get(key) : undefined
  const [state, setState] = useState<ForecastState>(() => (cached ? { status: 'ok', data: cached.data } : { status: point ? 'loading' : 'none' }))
  useEffect(() => {
    if (!point) return
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < FRESH_MS) {
      setState({ status: 'ok', data: hit.data })
      return
    }
    if (typeof fetch !== 'function') return setState({ status: 'none' })
    const ctrl = new AbortController()
    let cancelled = false
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const urls = forecastUrls(point.lat, point.lon, timeZone)
    void (async () => {
      try {
        const weather = await getJSON(urls.weather, ctrl.signal)
        // Waves are a bonus: the card still works without them.
        const marine = await getJSON(urls.marine, ctrl.signal).catch(() => undefined)
        const data = parseForecast(weather, marine, new Date().toISOString())
        cache.set(key, { at: Date.now(), data })
        if (!cancelled) setState({ status: 'ok', data })
      } catch {
        if (!cancelled) setState(hit ? { status: 'ok', data: hit.data } : { status: 'none' })
      } finally {
        clearTimeout(timer)
      }
    })()
    return () => {
      cancelled = true
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [key, point, timeZone])
  return state
}
