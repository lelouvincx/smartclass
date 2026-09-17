import { describe, expect, it } from 'vitest'
import { estimateGuestDelivery, normalizeGuestCostScenario } from './guest-cost-estimator'

const inventory = {
  guest_exercises: [
    {
      id: 1,
      question_assets: { count: 3, recorded_bytes: 300 },
      exercise_pdf: { metadata_present: true, recorded_bytes: 900 },
    },
    {
      id: 2,
      question_assets: { count: 1, recorded_bytes: 100 },
      exercise_pdf: { metadata_present: false, recorded_bytes: null },
    },
  ],
  totals: { question_asset_count: 4 },
}

describe('guest cost estimator', () => {
  it('normalizes invalid scenario values to non-negative whole numbers', () => {
    expect(normalizeGuestCostScenario({
      exerciseListViews: '10.8',
      exerciseLandingViews: '-1',
      completeExerciseRuns: 'not a number',
      sourcePdfDownloads: 2.9,
    })).toEqual({
      exerciseListViews: 10,
      exerciseLandingViews: 0,
      completeExerciseRuns: 0,
      sourcePdfDownloads: 2,
    })
  })

  it('estimates request units and bytes from unweighted catalog averages', () => {
    expect(estimateGuestDelivery(inventory, {
      exerciseListViews: 10,
      exerciseLandingViews: 20,
      completeExerciseRuns: 5,
      sourcePdfDownloads: 0,
    })).toMatchObject({
      dynamicRequests: 35,
      questionAssetReads: 10,
      sourcePdfReads: 0,
      r2ClassBReads: 10,
      questionAssetBytes: 1000,
      sourcePdfBytes: 0,
      recordedBytes: 1000,
      averageQuestionAssetBytes: 200,
      averageSourcePdfBytes: null,
      hasUnknownSourcePdfBytes: true,
    })
  })

  it('keeps combined bytes unknown when source PDF downloads include unknown PDF sizes', () => {
    expect(estimateGuestDelivery(inventory, {
      completeExerciseRuns: 5,
      sourcePdfDownloads: 2,
    })).toMatchObject({
      questionAssetBytes: 1000,
      sourcePdfBytes: null,
      recordedBytes: null,
      r2ClassBReads: 12,
      hasUnknownSourcePdfBytes: true,
    })
  })

  it('rounds final average-derived units instead of rounding the average first', () => {
    const estimate = estimateGuestDelivery({
      guest_exercises: [
        { question_assets: { count: 1, recorded_bytes: 10 }, exercise_pdf: { recorded_bytes: 100 } },
        { question_assets: { count: 2, recorded_bytes: 20 }, exercise_pdf: { recorded_bytes: 200 } },
      ],
    }, { completeExerciseRuns: 100 })

    expect(estimate).toMatchObject({
      questionAssetReads: 150,
      questionAssetBytes: 1500,
      recordedBytes: 1500,
    })
  })

  it('keeps source PDF bytes unknown when no exercise has recorded PDF metadata', () => {
    const estimate = estimateGuestDelivery({
      guest_exercises: [{ question_assets: { count: 1, recorded_bytes: 50 }, exercise_pdf: { recorded_bytes: null } }],
    }, { completeExerciseRuns: 2, sourcePdfDownloads: 3 })

    expect(estimate).toMatchObject({
      sourcePdfBytes: null,
      recordedBytes: null,
      questionAssetBytes: 100,
      r2ClassBReads: 5,
      hasUnknownSourcePdfBytes: true,
    })
  })
})
