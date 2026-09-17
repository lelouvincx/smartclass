const DEFAULT_SCENARIO = Object.freeze({
  exerciseListViews: 0,
  exerciseLandingViews: 0,
  completeExerciseRuns: 0,
  sourcePdfDownloads: 0,
})

function finiteNonNegative(value) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.floor(number)
}

export function normalizeGuestCostScenario(scenario = {}) {
  return {
    exerciseListViews: finiteNonNegative(scenario.exerciseListViews ?? DEFAULT_SCENARIO.exerciseListViews),
    exerciseLandingViews: finiteNonNegative(scenario.exerciseLandingViews ?? DEFAULT_SCENARIO.exerciseLandingViews),
    completeExerciseRuns: finiteNonNegative(scenario.completeExerciseRuns ?? DEFAULT_SCENARIO.completeExerciseRuns),
    sourcePdfDownloads: finiteNonNegative(scenario.sourcePdfDownloads ?? DEFAULT_SCENARIO.sourcePdfDownloads),
  }
}

export function exerciseRecordedBytes(exercise) {
  const questionBytes = Number(exercise?.question_assets?.recorded_bytes ?? 0)
  const pdfBytes = exercise?.exercise_pdf?.recorded_bytes
  return {
    questionBytes: Number.isFinite(questionBytes) && questionBytes > 0 ? questionBytes : 0,
    pdfBytes: Number.isFinite(Number(pdfBytes)) && Number(pdfBytes) > 0 ? Number(pdfBytes) : null,
  }
}

export function averageKnownPdfBytes(exercises = []) {
  const known = exercises
    .map(exercise => exerciseRecordedBytes(exercise).pdfBytes)
    .filter(value => value !== null)
  if (known.length === 0) return null
  return known.reduce((sum, value) => sum + value, 0) / known.length
}

export function averageQuestionAssetBytes(exercises = []) {
  if (exercises.length === 0) return 0
  const total = exercises.reduce((sum, exercise) => sum + exerciseRecordedBytes(exercise).questionBytes, 0)
  return total / exercises.length
}

export function averageQuestionAssetCount(exercises = []) {
  if (exercises.length === 0) return 0
  const total = exercises.reduce((sum, exercise) => {
    const count = Number(exercise?.question_assets?.count ?? 0)
    return sum + (Number.isFinite(count) && count > 0 ? count : 0)
  }, 0)
  return total / exercises.length
}

export function estimateGuestDelivery(inventory, scenario) {
  const normalized = normalizeGuestCostScenario(scenario)
  const exercises = inventory?.guest_exercises ?? []
  const averageQuestionCount = averageQuestionAssetCount(exercises)
  const averageQuestionBytes = averageQuestionAssetBytes(exercises)
  const averagePdfBytes = averageKnownPdfBytes(exercises)
  const hasUnknownSourcePdfBytes = exercises.some(exercise => exercise?.exercise_pdf?.recorded_bytes == null)

  const dynamicRequests = normalized.exerciseListViews
    + normalized.exerciseLandingViews
    + normalized.completeExerciseRuns
  const questionAssetReads = Math.round(normalized.completeExerciseRuns * averageQuestionCount)
  const questionAssetBytes = Math.round(normalized.completeExerciseRuns * averageQuestionBytes)
  const pdfReads = normalized.sourcePdfDownloads
  const pdfBytes = hasUnknownSourcePdfBytes && normalized.sourcePdfDownloads > 0
    ? null
    : Math.round(normalized.sourcePdfDownloads * (averagePdfBytes ?? 0))

  return {
    scenario: normalized,
    dynamicRequests,
    r2ClassBReads: questionAssetReads + pdfReads,
    questionAssetReads,
    sourcePdfReads: pdfReads,
    recordedBytes: pdfBytes === null ? null : questionAssetBytes + pdfBytes,
    questionAssetBytes,
    sourcePdfBytes: pdfBytes,
    averageQuestionAssetCount: averageQuestionCount,
    averageQuestionAssetBytes: averageQuestionBytes,
    averageSourcePdfBytes: hasUnknownSourcePdfBytes ? null : averagePdfBytes,
    hasUnknownSourcePdfBytes,
  }
}
