/**
 * Spaced review for cards of any domain (errors and concepts). Pure.
 *
 * Ladder 1 → 3 → 7 → 14 → 30 days, scaled by the card's ease (0.7–1.5, adaptive).
 * - Right answer on/after the due day: streak + 1, next rung × ease. Early reviews never advance.
 * - Wrong answer: back to 1 day, streak 0, status 'revisar', ease drops.
 * - Status: 1 spaced success → 'em_pratica', 2 → 'consolidando', ≥3 → 'dominado_provisorio'. Never
 *   "dominado" after one success, and never final: a new occurrence sends it back to 'revisar'.
 */
import type { DateKey, LearningError, NewItem, ReviewCardStatus } from '@/data/types'
import { addDays, diffDays } from '@/lib/date'

export const LADDER = [1, 3, 7, 14, 30] as const
export const EASE_MIN = 0.7
export const EASE_MAX = 1.5
export const DEFAULT_MAX_REVIEWS = 8

type Card = Pick<LearningError, 'status' | 'nextReview' | 'intervalDays' | 'ease' | 'streak' | 'lastReviewed' | 'count' | 'lastSeen'>
export type ReviewPatch = Pick<LearningError, 'status' | 'nextReview' | 'intervalDays' | 'ease' | 'streak' | 'lastReviewed'>

const clampEase = (e: number) => Math.min(EASE_MAX, Math.max(EASE_MIN, Math.round(e * 100) / 100))

export function statusForStreak(streak: number): ReviewCardStatus {
  if (streak >= 3) return 'dominado_provisorio'
  if (streak === 2) return 'consolidando'
  if (streak === 1) return 'em_pratica'
  return 'novo'
}

/** A fresh card's scheduling fields (first review tomorrow). */
export function newCardFields(today: DateKey): Pick<LearningError, 'status' | 'nextReview' | 'intervalDays' | 'ease' | 'streak' | 'firstSeen' | 'lastSeen' | 'count'> {
  return { status: 'novo', nextReview: addDays(today, 1), intervalDays: 1, ease: 1, streak: 0, firstSeen: today, lastSeen: today, count: 1 }
}

export function review(card: Card, correct: boolean, today: DateKey): ReviewPatch {
  const ease = card.ease || 1
  const streak = card.streak ?? 0
  if (!correct) {
    return { status: 'revisar', nextReview: addDays(today, 1), intervalDays: 1, ease: clampEase(ease - 0.15), streak: 0, lastReviewed: today }
  }
  // Early: practice, not a spaced success.
  if (today < card.nextReview) {
    return { status: card.status, nextReview: card.nextReview, intervalDays: card.intervalDays, ease: card.ease, streak, lastReviewed: today }
  }
  const nextStreak = streak + 1
  const nextEase = clampEase(ease + 0.05)
  const base = nextStreak < LADDER.length ? LADDER[nextStreak] : Math.min(120, Math.round(Math.max(card.intervalDays, 30) * 2))
  const interval = Math.max(1, Math.round(base * nextEase))
  return { status: statusForStreak(nextStreak), nextReview: addDays(today, interval), intervalDays: interval, ease: nextEase, streak: nextStreak, lastReviewed: today }
}

/** It happened again (she made the mistake again): impact up, back to review tomorrow. */
export function recordOccurrence(card: Card, today: DateKey): Pick<LearningError, 'count' | 'lastSeen' | 'status' | 'nextReview' | 'intervalDays' | 'streak'> {
  return { count: (card.count || 0) + 1, lastSeen: today, status: 'revisar', nextReview: addDays(today, 1), intervalDays: 1, streak: 0 }
}

/** Impact: how often it happens, how recent, how overdue, and whether it just failed. */
export function impact(card: Card, today: DateKey): number {
  const recency = Math.max(0, 30 - Math.max(0, diffDays(card.lastSeen, today))) / 3
  const overdue = Math.min(10, Math.max(0, diffDays(card.nextReview, today)))
  return (card.count || 1) * 3 + recency + overdue + (card.status === 'revisar' ? 5 : 0)
}

/** Cards due today, highest impact first, capped per day. */
export function dueCards<T extends LearningError>(cards: T[], today: DateKey, cap = DEFAULT_MAX_REVIEWS): T[] {
  return cards
    .filter((c) => c.nextReview <= today)
    .sort((a, b) => impact(b, today) - impact(a, today) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, cap))
}

/** Recurring = highest count (then most recent). */
export function recurring<T extends LearningError>(cards: T[], n = 3): T[] {
  return [...cards].filter((c) => (c.kind ?? 'erro') === 'erro').sort((a, b) => b.count - a.count || b.lastSeen.localeCompare(a.lastSeen)).slice(0, n)
}

export type NewCard = NewItem<'learningErrors'>
