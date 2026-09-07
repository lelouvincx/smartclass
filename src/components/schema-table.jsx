import React, { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import { GripVertical } from '@/components/material-symbol'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SegmentedButton, SegmentedButtonGroup } from '@/components/ui/segmented-button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// ── DragHandleButton ────────────────────────────────────────────────────────────

function DragHandleButton({ listeners, attributes, isDragging, questionNumber }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={t('teacher.schema.moveQuestion', { number: questionNumber })}
      className={cn(
        'flex size-[48px] cursor-grab touch-none items-center justify-center text-muted-foreground/40 transition-colors active:cursor-grabbing',
        isDragging && 'cursor-grabbing text-muted-foreground',
      )}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  )
}

function displayQuestionNumber(row) {
  return row.section_title
    ? `${row.section_title}, ${row.local_number ?? row.q_id}`
    : row.local_number ?? row.q_id
}

function ConfidenceValue({ confidence }) {
  const { t } = useTranslation()
  if (confidence === null) {
    return (
      <span title={t('teacher.schema.unscored')} aria-label={t('teacher.schema.unscored')}>
        —
      </span>
    )
  }

  return `${Math.round(confidence * 100)}%`
}

function AnswerTypeSelect({ row, value = row.type, onUpdateRow }) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={(nextValue) => onUpdateRow(row.id, 'type', nextValue)}>
      <SelectTrigger
        aria-label={t('teacher.schema.answerTypeAria', { number: displayQuestionNumber(row) })}
        className="w-full min-w-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mcq">{t('teacher.schema.multipleChoice')}</SelectItem>
        <SelectItem value="boolean">{t('teacher.schema.trueFalse')}</SelectItem>
        <SelectItem value="numeric">{t('teacher.schema.number')}</SelectItem>
      </SelectContent>
    </Select>
  )
}

function BooleanAnswerToggle({ row, onUpdateRow }) {
  const { t } = useTranslation()

  return (
    <SegmentedButtonGroup aria-label={t('teacher.schema.correctAnswerAria', { number: displayQuestionNumber(row) })}>
      <SegmentedButton
        selected={row.correct_answer === '1'}
        aria-label={t('teacher.schema.questionPartTrue', { number: displayQuestionNumber(row), part: row.sub_id })}
        onClick={() => onUpdateRow(row.id, 'correct_answer', '1')}
      >
        {t('teacher.schema.true')}
      </SegmentedButton>
      <SegmentedButton
        selected={row.correct_answer === '0'}
        aria-label={t('teacher.schema.questionPartFalse', { number: displayQuestionNumber(row), part: row.sub_id })}
        onClick={() => onUpdateRow(row.id, 'correct_answer', '0')}
      >
        {t('teacher.schema.false')}
      </SegmentedButton>
    </SegmentedButtonGroup>
  )
}

function StatusBadge({ row }) {
  const { t } = useTranslation()

  if (row.errors?.length > 0) {
    return <Badge variant="destructive" title={row.errors[0]} className="h-7 max-w-full rounded-[min(var(--sc-component-control-shape),10px)] px-2.5 whitespace-nowrap truncate">{row.errors[0]}</Badge>
  }

  if (row.warnings?.length > 0) {
    return <Badge variant="warning" title={row.warnings[0]} className="h-7 max-w-full rounded-[min(var(--sc-component-control-shape),10px)] px-2.5 whitespace-nowrap truncate">{row.warnings[0]}</Badge>
  }

  return <Badge variant="success">{t('teacher.schema.valid')}</Badge>
}

// ── SortableStandardRow ─────────────────────────────────────────────────────────

function SortableStandardRow({ row, onUpdateRow, onDeleteRow, showConfidence }) {
  const { t } = useTranslation()
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
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn('align-top', isDragging && 'bg-muted/60')}
    >
      <TableCell className="w-7 px-1 py-2">
        <DragHandleButton listeners={listeners} attributes={attributes} isDragging={isDragging} questionNumber={displayQuestionNumber(row)} />
      </TableCell>

      <TableCell className="px-3 py-2">
        <span className="block truncate py-3 text-sm font-medium" title={row.section_title || t('teacher.schema.mainSection')}>
          {row.section_title || t('teacher.schema.mainSection')}
        </span>
      </TableCell>

      <TableCell className="px-3 py-2">
        <Input
          aria-label={t('teacher.schema.localNumberAria', { question: displayQuestionNumber(row) })}
          type="number"
          min="1"
          value={row.local_number ?? row.q_id}
          onChange={(e) => onUpdateRow(row.id, 'local_number', e.target.value)}
          className="min-h-[48px] w-full"
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <AnswerTypeSelect row={row} onUpdateRow={onUpdateRow} />
      </TableCell>

      <TableCell className="px-3 py-2">
        <Input
          aria-label={t('teacher.schema.correctAnswerAria', { number: displayQuestionNumber(row) })}
          type="text"
          value={row.correct_answer}
          onChange={(e) => onUpdateRow(row.id, 'correct_answer', e.target.value)}
          className="min-h-[48px] w-full"
        />
      </TableCell>

      {showConfidence && (
        <TableCell className="px-3 py-2 text-muted-foreground">
          <ConfidenceValue confidence={row.confidence} />
        </TableCell>
      )}

      <TableCell className="overflow-hidden px-3 py-2">
        <StatusBadge row={row} />
      </TableCell>

      <TableCell className="px-3 py-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => onDeleteRow(row.id)}
        >
          {t('teacher.schema.delete')}
        </Button>
      </TableCell>
    </TableRow>
  )
}

// ── SortableBooleanGroup ────────────────────────────────────────────────────────
// A boolean question has 4 sub-rows (a,b,c,d). The drag handle and sortable ref
// are attached only to the first <tr>; the remaining rows follow visually.

function SortableBooleanGroup({ groupRows, onUpdateRow, onDeleteRow, showConfidence }) {
  const { t } = useTranslation()
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
        <TableRow
          key={row.id}
          ref={i === 0 ? setNodeRef : undefined}
          style={i === 0 ? style : undefined}
          className={cn('align-top', isDragging && 'bg-muted/60')}
        >
          {/* Drag handle cell — only on first sub-row */}
          <TableCell className="w-7 px-1 py-2">
            {i === 0 && (
              <DragHandleButton listeners={listeners} attributes={attributes} isDragging={isDragging} questionNumber={displayQuestionNumber(row)} />
            )}
          </TableCell>

          <TableCell className="px-3 py-2">
            {i === 0 && (
              <span className="block truncate py-3 text-sm font-medium" title={row.section_title || t('teacher.schema.mainSection')}>
                {row.section_title || t('teacher.schema.mainSection')}
              </span>
            )}
          </TableCell>

          <TableCell className="px-3 py-2">
            {i === 0 ? (
              <Input
                aria-label={t('teacher.schema.localNumberAria', { question: displayQuestionNumber(row) })}
                type="number"
                min="1"
                value={row.local_number ?? row.q_id}
                onChange={(e) => onUpdateRow(row.id, 'local_number', e.target.value)}
                className="min-h-[48px] w-full"
              />
            ) : (
              <span className="px-2 text-sm text-muted-foreground">{row.local_number ?? row.q_id}</span>
            )}
          </TableCell>

          {/* type — editable on first row only */}
          <TableCell className="px-3 py-2">
            {i === 0 ? (
              <AnswerTypeSelect row={row} value="boolean" onUpdateRow={onUpdateRow} />
            ) : (
              <span className="text-sm text-muted-foreground">{t('teacher.schema.trueFalse')}</span>
            )}
          </TableCell>

          {/* True/False toggle */}
          <TableCell className="px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="w-4 text-sm font-medium text-muted-foreground">{row.sub_id}.</span>
              <BooleanAnswerToggle row={row} onUpdateRow={onUpdateRow} />
            </div>
          </TableCell>

          {showConfidence && (
            <TableCell className="px-3 py-2 text-muted-foreground">
              {i === 0 ? <ConfidenceValue confidence={row.confidence} /> : ''}
            </TableCell>
          )}

          <TableCell className="overflow-hidden px-3 py-2">
            <StatusBadge row={row} />
          </TableCell>

          <TableCell className="px-3 py-2">
            {i === 0 && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => onDeleteRow(row.id)}
              >
                {t('teacher.schema.delete')}
              </Button>
            )}
          </TableCell>
        </TableRow>
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
//   onDeleteRow    — (id) => void
//   onReorder      — (newRows) => void  — called with full reordered rows array
//   showConfidence — boolean (default false)

export function SchemaTable({ rows, onUpdateRow, onDeleteRow, onReorder, showConfidence = false }) {
  const { t } = useTranslation()
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
    onReorder?.(newRows)
  }

  const showConfidenceCol = showConfidence && rows.some((r) => r.confidence !== undefined)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Table containerClassName="rounded-none border-0 border-t" className="table-fixed">
        <colgroup>
          <col className="w-[4%]" />
          <col className="w-[18%]" />
          <col className="w-[11%]" />
          <col className="w-[15%]" />
          <col className="w-[16%]" />
          {showConfidenceCol && <col className="w-[14%]" />}
          <col className="w-[14%]" />
          <col className="w-[8%]" />
        </colgroup>
        <TableHeader>
            <TableRow className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted">
              <TableHead className="w-7 px-1 py-2" />
              <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.section')}</TableHead>
              <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.questionNumber')}</TableHead>
              <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.type')}</TableHead>
              <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.correctAnswer')}</TableHead>
              {showConfidenceCol && <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.confidence')}</TableHead>}
              <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.status')}</TableHead>
              <TableHead className="px-3 py-2 whitespace-normal leading-4">{t('teacher.schema.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            <TableBody>
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
            </TableBody>
          </SortableContext>
      </Table>
    </DndContext>
  )
}
