/**
 * Long-press → drag for the lines of a list (Pointer Events: touch and mouse alike).
 *
 * - Press and hold ~350 ms without moving (> 8 px cancels) → the drag starts. A quick vertical move is a
 *   scroll, a quick horizontal one is the row's swipe — both keep working because nothing happens before.
 * - Once dragging, the page doesn't scroll (touchmove prevented), the row's swipe doesn't see the moves
 *   (pointermove stopped at the window, capture phase), and the click that ends the gesture is swallowed.
 * - Near the top/bottom of the viewport the page scrolls by itself.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { haptic } from '@/lib/haptics'
import { indexAt } from './drag'

export const LONG_PRESS_MS = 350
export const MOVE_SLOP = 8
const EDGE = 72
const SPEED = 10

export interface DragView {
  from: number
  /** Final index in the reordered list. */
  to: number
  /** Offset of the lifted row from its place (px). */
  dy: number
  /** Where the drop line goes, in the list's coordinates (px). */
  lineY: number
}

interface Rect {
  top: number
  bottom: number
}

interface Session {
  pointerId: number
  from: number
  x0: number
  y0: number
  scroll0: number
  timer?: ReturnType<typeof setTimeout>
  dragging: boolean
  /** Current final index (what a release drops at). */
  to: number
  rects: Rect[]
  lastY: number
  raf?: number
  cleanup: (() => void)[]
}

const scrollY = () => (typeof window === 'undefined' ? 0 : window.scrollY || 0)

export function useLongPressDrag({ listRef, canDrag, onDrop }: { listRef: RefObject<HTMLElement | null>; canDrag: (i: number) => boolean; onDrop: (from: number, to: number) => void }) {
  const [view, setView] = useState<DragView>()
  const session = useRef<Session | undefined>(undefined)
  const dropRef = useRef(onDrop)
  useEffect(() => {
    dropRef.current = onDrop
  }, [onDrop])

  const end = useCallback((drop: boolean) => {
    const s = session.current
    if (!s) return
    session.current = undefined
    if (s.timer) clearTimeout(s.timer)
    if (s.raf !== undefined) cancelAnimationFrame(s.raf)
    for (const c of s.cleanup) c()
    if (!s.dragging) return
    // The click that follows the release must not open the line.
    const swallow = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    window.addEventListener('click', swallow, true)
    setTimeout(() => window.removeEventListener('click', swallow, true), 0)
    setView(undefined)
    if (drop) dropRef.current(s.from, s.to)
  }, [])

  useEffect(() => () => end(false), [end])

  const update = useCallback((clientY: number) => {
    const s = session.current
    const list = listRef.current
    if (!s || !s.dragging || !list) return
    s.lastY = clientY
    const py = clientY - list.getBoundingClientRect().top
    const others = s.rects.filter((_, i) => i !== s.from)
    const to = indexAt(
      others.map((r) => (r.top + r.bottom) / 2),
      py,
    )
    const lineY = !others.length ? s.rects[s.from].top : to === 0 ? others[0].top : others[to - 1].bottom
    const dy = clientY - s.y0 + (scrollY() - s.scroll0)
    s.to = to
    setView({ from: s.from, to, dy, lineY })
  }, [listRef])

  const begin = useCallback(() => {
    const s = session.current
    const list = listRef.current
    if (!s || !list) return
    s.timer = undefined
    s.dragging = true
    const top = list.getBoundingClientRect().top
    s.rects = [...list.querySelectorAll<HTMLElement>('[data-drag-index]')].map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top - top, bottom: r.bottom - top }
    })
    haptic('light')
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== s.pointerId) return
      ev.stopPropagation()
      ev.preventDefault()
      update(ev.clientY)
    }
    const noScroll = (ev: TouchEvent) => ev.preventDefault()
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('touchmove', noScroll, { passive: false, capture: true })
    s.cleanup.push(() => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('touchmove', noScroll, true)
    })
    // Auto-scroll near the viewport's edges.
    if (typeof requestAnimationFrame === 'function') {
      const tick = () => {
        const cur = session.current
        if (cur !== s) return
        const h = window.innerHeight || 0
        const step = s.lastY < EDGE ? -SPEED : h && s.lastY > h - EDGE ? SPEED : 0
        if (step) {
          window.scrollBy(0, step)
          update(s.lastY)
        }
        s.raf = requestAnimationFrame(tick)
      }
      s.raf = requestAnimationFrame(tick)
    }
    update(s.y0)
  }, [listRef, update])

  const onPointerDown = useCallback(
    (i: number, e: ReactPointerEvent) => {
      if (session.current || !canDrag(i)) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      const s: Session = { pointerId: e.pointerId, from: i, x0: e.clientX, y0: e.clientY, scroll0: scrollY(), dragging: false, to: i, rects: [], lastY: e.clientY, cleanup: [] }
      session.current = s
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== s.pointerId || s.dragging) return
        if (Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) > MOVE_SLOP) end(false)
      }
      const onUp = (ev: PointerEvent) => ev.pointerId === s.pointerId && end(true)
      const onCancel = (ev: PointerEvent) => ev.pointerId === s.pointerId && end(false)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onCancel)
      s.cleanup.push(() => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onCancel)
      })
      s.timer = setTimeout(begin, LONG_PRESS_MS)
    },
    [canDrag, begin, end],
  )

  /** Long-press opens no context menu / callout. */
  const onContextMenu = useCallback((e: { preventDefault: () => void }) => {
    if (session.current) e.preventDefault()
  }, [])

  return { view, onPointerDown, onContextMenu }
}
