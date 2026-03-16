import React, { useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── DragHandleButton ────────────────────────────────────────────────────────────

function DragHandleButton({ listeners, attributes, isDragging }) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      className={cn(
        'flex cursor-grab touch-none items-center text-muted-foreground/40 transition-colors active:cursor-grabbing',
        isDragging && 'cursor-grabbing text-muted-foreground',
      )}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

// ── SortableStandardRow ─────────────────────────────────────────────────────────

function SortableStandardRow({ row, onUpdateRow, onDeleteRow, showConfidence }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(row.q_id) })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn('border-t align-top', isDragging && 'bg-muted/60')}
    >
      <td className="w-7 px-1 py-2">
        <DragHandleButton listeners={listeners} attributes={attributes} isDragging={isDragging} />
      </td>

      <td className="px-3 py-2">
        <Input
          aria-label={`q-id-${row.id}`}
          type="text"
          value={row.q_id}
          onChange={(e) => onUpdateRow(row.id, 'q_id', e.target.value)}
          className="h-9 w-20"
        />
      </td>

      <td className="px-3 py-2">
        <select
          aria-label={`type-${row.id}`}
          value={row.type}
          onChange={(e) => onUpdateRow(row.id, 'type', e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="mcq">mcq</option>
          <option value="boolean">boolean</option>
          <option value="numeric">numeric</option>
        </select>
      </td>

      <td className="px-3 py-2">
        <Input
          aria-label={`answer-${row.id}`}
          type="text"
          value={row.correct_answer}
          onChange={(e) => onUpdateRow(row.id, 'correct_answer', e.target.value)}
          className="h-9 w-36"
        />
      </td>

      {showConfidence && (
        <td className="px-3 py-2 text-muted-foreground">
          {Math.round((row.confidence ?? 1) * 100)}%
        </td>
      )}

      <td className="px-3 py-2">
        {row.errors?.length > 0
          ? <span className="text-xs text-destructive">{row.errors[0]}</span>
          : row.warnings?.length > 0
          ? <span className="text-xs text-amber-600">{row.warnings[0]}</span>
          : <span className="text-xs text-emerald-700 dark:text-emerald-400">Valid</span>
        }
      </td>

      <td className="px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDeleteRow(row.id)}
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </td>
    </tr>
  )
}

// ── SortableBooleanGroup ────────────────────────────────────────────────────────
// A boolean question has 4 sub-rows (a,b,c,d). The drag handle and sortable ref
// are attached only to the first <tr>; the remaining rows follow visually.

function SortableBooleanGroup({ groupRows, onUpdateRow, onUpdateQid, onDeleteRow, showConfidence }) {
  const firstRow = groupRows[0]
  const qid = String(firstRow.q_id)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: qid })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 1 : undefined,
  }

  return (
    <>
      {groupRows.map((row, i) => (
        <tr
          key={row.id}
          ref={i === 0 ? setNodeRef : undefined}
          style={i === 0 ? style : undefined}
          className={cn('border-t align-top', isDragging && 'bg-muted/60')}
        >
          {/* Drag handle cell — only on first sub-row */}
          <td className="w-7 px-1 py-2">
            {i === 0 && (
              <DragHandleButton listeners={listeners} attributes={attributes} isDragging={isDragging} />
            )}
          </td>

          {/* q_id — editable on first row only */}
          <td className="px-3 py-2">
            {i === 0 ? (
              <Input
                aria-label={`q-id-${row.id}`}
                type="text"
                value={row.q_id}
                onChange={(e) => onUpdateQid(row.id, e.target.value)}
                className="h-9 w-20"
              />
            ) : (
              <span className="px-2 text-sm text-muted-foreground">{row.q_id}</span>
            )}
          </td>

          {/* type — editable on first row only */}
          <td className="px-3 py-2">
            {i === 0 ? (
              <select
                aria-label={`type-${row.id}`}
                value="boolean"
                onChange={(e) => onUpdateRow(row.id, 'type', e.target.value)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
              >
                <option value="mcq">mcq</option>
                <option value="boolean">boolean</option>
                <option value="numeric">numeric</option>
              </select>
            ) : (
              <span className="text-sm text-muted-foreground">boolean</span>
            )}
          </td>

          {/* True/False toggle */}
          <td className="px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="w-4 text-sm font-medium text-muted-foreground">{row.sub_id}.</span>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={`bool-${row.id}`}
                  value="1"
                  checked={row.correct_answer === '1'}
                  onChange={() => onUpdateRow(row.id, 'correct_answer', '1')}
                  aria-label={`sub-q ${row.q_id} ${row.sub_id} true`}
                />
                True
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={`bool-${row.id}`}
                  value="0"
                  checked={row.correct_answer === '0'}
                  onChange={() => onUpdateRow(row.id, 'correct_answer', '0')}
                  aria-label={`sub-q ${row.q_id} ${row.sub_id} false`}
                />
                False
              </label>
            </div>
          </td>

          {showConfidence && (
            <td className="px-3 py-2 text-muted-foreground">
              {i === 0 ? `${Math.round((row.confidence ?? 1) * 100)}%` : ''}
            </td>
          )}

          <td className="px-3 py-2">
            {row.errors?.length > 0
              ? <span className="text-xs text-destructive">{row.errors[0]}</span>
              : row.warnings?.length > 0
              ? <span className="text-xs text-amber-600">{row.warnings[0]}</span>
              : <span className="text-xs text-emerald-700 dark:text-emerald-400">Valid</span>
            }
          </td>

          <td className="px-3 py-2">
            {i === 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDeleteRow(row.id)}
                className="text-destructive hover:text-destructive"
              >
                Delete
              </Button>
            )}
          </td>
        </tr>
      ))}
    </>
  )
}

// ── SchemaTable ────────────────────────────────────────────────────────────────
// Public component shared between TeacherCreateExercisePage and
// TeacherViewExercisePage (edit mode).
//
// Props:
//   rows           — flat validated row array (may include .confidence, .warnings)
//   onUpdateRow    — (id, field, value) => void
//   onUpdateQid    — (id, value) => void
//   onDeleteRow    — (id) => void
//   onReorder      — (newRows) => void  — called with full reordered rows array
//   showConfidence — boolean (default false)

export function SchemaTable({ rows, onUpdateRow, onUpdateQid, onDeleteRow, onReorder, showConfidence = false }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Ordered list of unique q_ids (preserves row order)
  const groupIds = useMemo(() => {
    const seen = new Set()
    const ids = []
    for (const row of rows) {
      const key = String(row.q_id)
      if (!seen.has(key)) { seen.add(key); ids.push(key) }
    }
    return ids
  }, [rows])

  // Map from q_id → rows[]
  const groupMap = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      const key = String(row.q_id)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(row)
    }
    return map
  }, [rows])

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeIdx = groupIds.indexOf(String(active.id))
    const overIdx = groupIds.indexOf(String(over.id))
    if (activeIdx === -1 || overIdx === -1) return

    // Reorder groupIds then rebuild the flat rows array preserving group blocks
    const newGroupIds = arrayMove(groupIds, activeIdx, overIdx)
    const newRows = newGroupIds.flatMap((qid) => groupMap.get(qid) || [])
    onReorder(newRows)
  }

  const showConfidenceCol = showConfidence && rows.some((r) => r.confidence !== undefined)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-7 px-1 py-2" />
              <th className="px-3 py-2">q_id</th>
              <th className="px-3 py-2">type</th>
              <th className="px-3 py-2">correct_answer</th>
              {showConfidenceCol && <th className="px-3 py-2">confidence</th>}
              <th className="px-3 py-2">status</th>
              <th className="px-3 py-2">actions</th>
            </tr>
          </thead>
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            <tbody>
              {groupIds.map((qid) => {
                const groupRows = groupMap.get(qid) || []
                if (!groupRows.length) return null
                const isBoolean = groupRows[0].type === 'boolean'

                if (isBoolean) {
                  return (
                    <SortableBooleanGroup
                      key={qid}
                      groupRows={groupRows}
                      onUpdateRow={onUpdateRow}
                      onUpdateQid={onUpdateQid}
                      onDeleteRow={onDeleteRow}
                      showConfidence={showConfidenceCol}
                    />
                  )
                }

                return (
                  <SortableStandardRow
                    key={qid}
                    row={groupRows[0]}
                    onUpdateRow={onUpdateRow}
                    onDeleteRow={onDeleteRow}
                    showConfidence={showConfidenceCol}
                  />
                )
              })}
            </tbody>
          </SortableContext>
        </table>
      </div>
    </DndContext>
  )
}
