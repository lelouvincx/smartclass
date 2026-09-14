import { describe, expect, it } from 'vitest'
import {
  audienceChangeForLecture,
  buildGroupMoveImpact,
  freezeRevision,
  placementPath,
  withCurrentPlacementRemoved,
} from './curriculum-utils'

describe('curriculum management utilities', () => {
  it('uses placement_id paths and reports actual gained and lost programme audiences', () => {
    const t = (key) => ({ 'curriculum.programmes.10': 'Grade 10', 'curriculum.programmes.dgnl': 'ĐGNL' }[key] ?? key)
    const lecture = {
      placements: [
        { placement_id: 1, programme: 10, topic_title: 'Algebra', lesson_title: 'Lines' },
        { placement_id: 2, programme: 'dgnl', topic_title: 'Exam', lesson_title: 'Lines' },
      ],
    }

    expect(placementPath(lecture.placements[0], t)).toBe('Grade 10 › Algebra › Lines')
    expect(withCurrentPlacementRemoved(lecture, 1)).toEqual([lecture.placements[1]])
    expect(audienceChangeForLecture(lecture, withCurrentPlacementRemoved(lecture, 1))).toEqual({ gained: [], lost: [10] })
    expect(audienceChangeForLecture(lecture, [...lecture.placements, { programme: 12 }])).toEqual({ gained: [12], lost: [] })
  })

  it('freezes the lower available revision instead of upgrading after async refresh', () => {
    expect(freezeRevision(9, 8)).toBe(8)
    expect(freezeRevision(11, 8)).toBe(8)
  })

  it('enumerates asymmetric shared-video impact when moving a topic between programmes', () => {
    const topics = [
      { id: 10, programme: 10, title: 'Grade 10 topic', lessons: [{ id: 20, topic_id: 10, title: 'Other grade 10 lesson' }] },
      { id: 11, programme: 10, title: 'Topic 11', lessons: [{ id: 21, topic_id: 11, title: 'Lesson 21' }] },
      { id: 12, programme: 'dgnl', title: 'ĐGNL topic', lessons: [{ id: 22, topic_id: 12, title: 'ĐGNL lesson' }] },
    ]
    const library = [
      { id: 'A', title: 'videoA', minimum_access_tier: 'standard', is_visible: 1, placements: [{ placement_id: 101, lesson_id: 21, topic_id: 11, programme: 10, topic_title: 'Topic 11', lesson_title: 'Lesson 21' }, { placement_id: 102, lesson_id: 22, topic_id: 12, programme: 'dgnl', topic_title: 'ĐGNL topic', lesson_title: 'ĐGNL lesson' }] },
      { id: 'B', title: 'videoB', minimum_access_tier: 'standard', is_visible: 1, placements: [{ placement_id: 201, lesson_id: 21, topic_id: 11, programme: 10, topic_title: 'Topic 11', lesson_title: 'Lesson 21' }, { placement_id: 202, lesson_id: 20, topic_id: 10, programme: 10, topic_title: 'Grade 10 topic', lesson_title: 'Other grade 10 lesson' }] },
      { id: 'C', title: 'videoC', minimum_access_tier: 'standard', is_visible: 1, placements: [{ placement_id: 301, lesson_id: 21, topic_id: 11, programme: 10, topic_title: 'Topic 11', lesson_title: 'Lesson 21' }] },
      { id: 'D', title: 'videoD', minimum_access_tier: 'standard', is_visible: 1, placements: [{ placement_id: 401, lesson_id: 20, topic_id: 10, programme: 10, topic_title: 'Grade 10 topic', lesson_title: 'Other grade 10 lesson' }] },
    ]

    const impact = buildGroupMoveImpact({ type: 'topic', resource: topics[1], destinationProgramme: 'thpt', topics, library })

    expect(impact.map((item) => ({ title: item.lecture.title, gained: item.change.gained, lost: item.change.lost }))).toEqual([
      { title: 'videoA', gained: ['thpt'], lost: [10] },
      { title: 'videoB', gained: ['thpt'], lost: [] },
      { title: 'videoC', gained: ['thpt'], lost: [10] },
    ])
    expect(impact.find((item) => item.lecture.title === 'videoD')).toBeUndefined()
  })

  it('preserves unrelated placements and rewrites only moved lesson paths', () => {
    const topics = [
      { id: 11, programme: 10, title: 'Topic 11', lessons: [{ id: 21, topic_id: 11, title: 'Lesson 21' }, { id: 22, topic_id: 11, title: 'Other lesson' }] },
      { id: 13, programme: 12, title: 'Topic 13', lessons: [] },
    ]
    const library = [
      { id: 1, title: 'Lesson video', minimum_access_tier: 'standard', is_visible: 1, placements: [{ placement_id: 1, lesson_id: 21, topic_id: 11, programme: 10, topic_title: 'Topic 11', lesson_title: 'Lesson 21' }, { placement_id: 2, lesson_id: 22, topic_id: 11, programme: 10, topic_title: 'Topic 11', lesson_title: 'Other lesson' }] },
    ]

    const [impact] = buildGroupMoveImpact({ type: 'lesson', resource: topics[0].lessons[0], destinationTopicId: 13, topics, library })

    expect(impact.previousPlacements).toEqual(library[0].placements)
    expect(impact.nextPlacements).toEqual([
      { placement_id: 1, lesson_id: 21, topic_id: 13, programme: 12, topic_title: 'Topic 13', lesson_title: 'Lesson 21' },
      { placement_id: 2, lesson_id: 22, topic_id: 11, programme: 10, topic_title: 'Topic 11', lesson_title: 'Other lesson' },
    ])
    expect(impact.affectedPlacements).toEqual([{ placement_id: 1, lesson_id: 21, topic_id: 13, programme: 12, topic_title: 'Topic 13', lesson_title: 'Lesson 21' }])
  })
})
