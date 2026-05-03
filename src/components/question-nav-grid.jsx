import React from 'react'
import { cn } from '@/lib/utils'

function truncate(val, len) {
  const s = String(val)
  return s.length > len ? s.slice(0, len) : s
}

function getCellContent(qId, schema, answers, displayIdx) {
  const subRows = schema.filter((r) => r.q_id === qId)
  const type = subRows[0]?.type

  if (type === 'mcq') {
    const a = answers[qId]
    if (!a) return { answered: false, text: String(displayIdx) }
    return { answered: true, text: `${displayIdx}:${a}` }
  }

  if (type === 'numeric') {
    const a = answers[qId]
    if (a === '' || a == null) return { answered: false, text: String(displayIdx) }
    return { answered: true, text: `${displayIdx}:${truncate(String(a), 4)}` }
  }

  // boolean: all sub-rows must have a non-empty answer
  const subAns = answers[qId] || {}
  const allAnswered = subRows.every((r) => subAns[r.sub_id] !== '' && subAns[r.sub_id] != null)
  if (!allAnswered) return { answered: false, text: String(displayIdx) }
  return { answered: true, text: `${displayIdx}:✓` }
}

export function countUnanswered(schema, answers) {
  const qIds = [...new Set(schema.map((r) => r.q_id))]
  return qIds.filter((qId, idx) => {
    const { answered } = getCellContent(qId, schema, answers, idx + 1)
    return !answered
  }).length
}

export function QuestionNavGrid({ schema, answers, currentQId, onJump }) {
  const qIds = [...new Set(schema.map((r) => r.q_id))]
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Answer Sheet
      </p>
      <div className="grid grid-cols-5 gap-1">
        {qIds.map((qId, idx) => {
          const { answered, text } = getCellContent(qId, schema, answers, idx + 1)
          const isCurrent = qId === currentQId
          return (
            <button
              key={qId}
              type="button"
              aria-label={`Jump to question ${idx + 1}`}
              onClick={() => onJump(qId)}
              className={cn(
                'flex h-9 w-full items-center justify-center rounded text-xs font-medium transition-colors',
                isCurrent && 'ring-2 ring-primary',
                answered
                  ? 'bg-primary/15 text-primary'
                  : 'border border-muted-foreground/30 text-muted-foreground hover:bg-muted',
              )}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}
