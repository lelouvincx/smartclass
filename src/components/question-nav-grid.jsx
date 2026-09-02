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
      <p className="mb-2 text-sm font-semibold text-foreground">
        Answer Sheet
      </p>
      <div className="grid grid-cols-5 gap-2">
        <span id="question-answered-status" className="sr-only">Answered</span>
        <span id="question-unanswered-status" className="sr-only">Unanswered</span>
        {qIds.map((qId, idx) => {
          const { answered, text } = getCellContent(qId, schema, answers, idx + 1)
          const isCurrent = qId === currentQId
          return (
            <button
              key={qId}
              type="button"
              aria-label={`Jump to question ${idx + 1}`}
              aria-describedby={answered ? 'question-answered-status' : 'question-unanswered-status'}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onJump(qId)}
              className={cn(
                'flex min-h-[var(--sc-component-question-target)] w-full items-center justify-center rounded-[var(--sc-shape-md)] text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-[var(--sc-motion-duration-short)]',
                isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
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
