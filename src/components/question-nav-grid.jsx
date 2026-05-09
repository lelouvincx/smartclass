import React from 'react'
import { cn } from '@/lib/utils'

function getCellContent(qId, schema, answers, displayIdx) {
  const subRows = schema.filter((r) => r.q_id === qId)
  const type = subRows[0]?.type
  const text = String(displayIdx)

  if (type === 'mcq') {
    const a = answers[qId]
    return { answered: !!a, text }
  }

  if (type === 'numeric') {
    const a = answers[qId]
    return { answered: !(a === '' || a == null), text }
  }

  // boolean: all sub-rows must have a non-empty answer
  const subAns = answers[qId] || {}
  const allAnswered = subRows.every((r) => subAns[r.sub_id] !== '' && subAns[r.sub_id] != null)
  return { answered: allAnswered, text }
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
