import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@/lib/dnd-modifiers'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { haptic } from '@/lib/haptics'
import { cn } from '@/lib/cn'

/** Touch: long-press 180ms on the handle to start dragging, so scrolling never fights DnD. */
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

export interface SortableListProps<T extends { id: string }> {
  items: T[]
  /** Called with ids in the new order — usually `ids => actions.reorder('tasks', ids)`. */
  onReorder: (ids: string[]) => void
  renderItem: (item: T, handle: ReactNode) => ReactNode
  className?: string
}

/** Vertical drag-to-reorder list with a grip handle passed to each row. */
export function SortableList<T extends { id: string }>({ items, onReorder, renderItem, className }: SortableListProps<T>) {
  const sensors = useDndSensors()
  const ids = items.map((i) => i.id)
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = ids.indexOf(String(e.active.id))
    const to = ids.indexOf(String(e.over.id))
    onReorder(arrayMove(ids, from, to))
    haptic('light')
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis]}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      aria-label="Arrastar para reordenar"
      className="h-11 w-8 -my-2 inline-flex items-center justify-center text-muted/70 touch-none shrink-0"
    >
      <GripVertical size={16} />
    </button>
  )
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-lg rounded-2xl')}
    >
      {children(handle)}
    </div>
  )
}
