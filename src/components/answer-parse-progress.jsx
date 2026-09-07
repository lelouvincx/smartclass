import React, { useEffect, useRef, useState } from 'react'
import { ProgressIndicator } from '@/design-system/progress-indicator'

const WAIT_HORIZON_MS = 15_000

const REDUCED_STAGE_PROGRESS = {
  reading: 15,
  rendering: 35,
  waiting: 70,
  applying: 95,
  complete: 100,
}

function clampProgress(value) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ))

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined

    const handleChange = (event) => setReducedMotion(event.matches)
    query.addEventListener?.('change', handleChange)
    return () => query.removeEventListener?.('change', handleChange)
  }, [])

  return reducedMotion
}

function measuredProgress(stage, stageProgress, waitingElapsed) {
  const fraction = clampProgress(stageProgress)

  switch (stage) {
    case 'reading':
      return fraction * 20
    case 'rendering':
      return 20 + fraction * 20
    case 'waiting':
      return 40 + Math.min(waitingElapsed / WAIT_HORIZON_MS, 1) * 50
    case 'applying':
      return 90 + fraction * 9
    case 'complete':
      return 100
    default:
      return 0
  }
}

export default function AnswerParseProgress({ stage, stageProgress = 0, labels = {} }) {
  const reducedMotion = usePrefersReducedMotion()
  const [waitingElapsed, setWaitingElapsed] = useState(0)
  const lastProgressRef = useRef(0)

  useEffect(() => {
    if (stage !== 'waiting') {
      setWaitingElapsed(0)
      return undefined
    }

    setWaitingElapsed(0)
    const startedAt = Date.now()
    if (reducedMotion) {
      const timeout = setTimeout(() => setWaitingElapsed(WAIT_HORIZON_MS), WAIT_HORIZON_MS)
      return () => clearTimeout(timeout)
    }

    const interval = setInterval(() => {
      setWaitingElapsed(Math.min(Date.now() - startedAt, WAIT_HORIZON_MS))
    }, 100)
    return () => clearInterval(interval)
  }, [reducedMotion, stage])

  let progress
  if (stage === 'error') {
    progress = lastProgressRef.current
  } else if (reducedMotion) {
    progress = stage === 'waiting' && waitingElapsed >= WAIT_HORIZON_MS
      ? 90
      : (REDUCED_STAGE_PROGRESS[stage] ?? 0)
    lastProgressRef.current = progress
  } else {
    progress = measuredProgress(stage, stageProgress, waitingElapsed)
    lastProgressRef.current = progress
  }

  const roundedProgress = Math.min(stage === 'complete' ? 100 : 99, Math.round(progress))
  const isStillWaiting = stage === 'waiting' && waitingElapsed >= WAIT_HORIZON_MS
  const stageText = stage === 'error'
    ? labels.error
    : isStillWaiting
      ? labels.stillWaiting
      : labels[stage]

  return (
    <div className="space-y-2">
      <p className={`text-sm font-medium ${stage === 'error' ? 'text-destructive' : 'text-foreground'}`}>
        {stageText}
      </p>
      <ProgressIndicator
        value={roundedProgress}
        valueText={stageText}
        variant={stage === 'error' ? 'danger' : 'default'}
      />
    </div>
  )
}
