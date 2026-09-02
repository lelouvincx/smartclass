import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearAllSubmissionDrafts,
  getSubmissionPointer,
  loadSubmissionDraft,
  saveSubmissionDraft,
  setSubmissionPointer,
  submissionDraftKey,
} from './submission-draft'

const schema = [
  { q_id: 1, type: 'mcq', sub_id: null },
  { q_id: 2, type: 'boolean', sub_id: 'a' },
]

describe('submission drafts', () => {
  beforeEach(() => sessionStorage.clear())

  it('restores only schema-known answer and confidence cells', () => {
    saveSubmissionDraft({
      accountId: 7,
      submissionId: 10,
      answers: { 1: 'B', 2: { a: '1', z: '0' }, 99: 'C' },
      extractedConfidence: { '1:': 0.9, '2:a': 0.7, '2:z': 0.2, '99:': 1 },
    })

    expect(loadSubmissionDraft({ accountId: 7, submissionId: 10, schema })).toEqual({
      answers: { 1: 'B', 2: { a: '1' } },
      extractedConfidence: { '1:': 0.9, '2:a': 0.7 },
    })
  })

  it('ignores corrupt and account-mismatched records', () => {
    sessionStorage.setItem(submissionDraftKey(7, 10), '{bad json')
    expect(loadSubmissionDraft({ accountId: 7, submissionId: 10, schema })).toBeNull()

    saveSubmissionDraft({ accountId: 7, submissionId: 10, answers: {}, extractedConfidence: {} })
    sessionStorage.setItem(submissionDraftKey(8, 10), sessionStorage.getItem(submissionDraftKey(7, 10)))
    expect(loadSubmissionDraft({ accountId: 8, submissionId: 10, schema })).toBeNull()
  })

  it('isolates pointers by account and clears submission state on logout', () => {
    setSubmissionPointer(7, 1, 10)
    setSubmissionPointer(8, 1, 20)
    expect(getSubmissionPointer(7, 1)).toBe('10')
    expect(getSubmissionPointer(8, 1)).toBe('20')
    clearAllSubmissionDrafts()
    expect(getSubmissionPointer(7, 1)).toBeNull()
    expect(getSubmissionPointer(8, 1)).toBeNull()
  })
})
