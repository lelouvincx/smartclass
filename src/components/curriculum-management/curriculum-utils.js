export const ACCESS_TIERS = ['guest', 'standard', 'vip']

export function normaliseResponseList(response) {
  const body = response?.data ?? response ?? {}
  return {
    revision: body.revision,
    lectures: body.lectures ?? body.data ?? [],
  }
}

export function normaliseRevision(response, fallback) {
  const body = response?.data ?? response ?? {}
  return body.revision ?? fallback
}

export function programmeLabel(programme, t) {
  return t ? t(`curriculum.programmes.${programme}`) : String(programme)
}

export function compareProgramme(a, b, programmes = [10, 11, 12, 'thpt', 'dgnl']) {
  return programmes.indexOf(a) - programmes.indexOf(b)
}

export function placementPath(placement, t) {
  return [programmeLabel(placement.programme, t), placement.topic_title, placement.lesson_title]
    .filter(Boolean)
    .join(' › ')
}

export function lectureProgrammes(lecture) {
  return [...new Set((lecture?.placements ?? []).map((placement) => placement.programme))]
}

export function formatProgrammeSet(programmes, t) {
  if (!programmes?.length) return t ? t('curriculumManagement.impact.none') : ''
  return programmes.map((programme) => programmeLabel(programme, t)).join(', ')
}

export function buildPlacementIndex(library) {
  const placementsByLecture = new Map()
  for (const lecture of library ?? []) {
    placementsByLecture.set(lecture.id, lecture.placements ?? [])
  }
  return placementsByLecture
}

export function withCurrentPlacementRemoved(lecture, placementId) {
  return (lecture?.placements ?? []).filter((placement) => placement.placement_id !== placementId)
}

export function audienceChangeForLecture(lecture, nextPlacements) {
  const before = new Set(lectureProgrammes(lecture))
  const after = new Set((nextPlacements ?? []).map((placement) => placement.programme))
  return {
    gained: [...after].filter((programme) => !before.has(programme)),
    lost: [...before].filter((programme) => !after.has(programme)),
  }
}

export function accessSummaryForLecture(lecture, placements = lecture?.placements) {
  if (!lecture?.is_visible) return { key: 'curriculumManagement.impact.accessHidden' }
  if (!placements?.length) return { key: 'curriculumManagement.impact.accessUnplaced' }
  if ((lecture.minimum_access_tier ?? 'standard') === 'guest') return { key: 'curriculumManagement.impact.accessPublic' }
  return {
    key: 'curriculumManagement.impact.accessRestricted',
    tier: lecture.minimum_access_tier ?? 'standard',
    programmes: [...new Set(placements.map((placement) => placement.programme))],
  }
}

export function buildGroupMoveImpact({ type, resource, destinationProgramme, destinationTopicId, topics = [], library = [] }) {
  const topicById = new Map((topics ?? []).map((topic) => [Number(topic.id), topic]))
  const lessonById = new Map()
  for (const topic of topics ?? []) {
    for (const lesson of topic.lessons ?? []) {
      lessonById.set(Number(lesson.id), { ...lesson, topic })
    }
  }

  const sourceTopicId = type === 'topic' ? Number(resource?.id) : Number(resource?.topic_id)
  const destinationTopic = type === 'lesson' ? topicById.get(Number(destinationTopicId)) : null
  const movedLessonIds = new Set(
    type === 'topic'
      ? (resource?.lessons ?? []).map((lesson) => Number(lesson.id))
      : [Number(resource?.id)],
  )
  const movedTopicTitle = resource?.title

  return (library ?? [])
    .map((lecture) => {
      const previousPlacements = lecture.placements ?? []
      const affectedPlacements = []
      const nextPlacements = previousPlacements.map((placement) => {
        const lessonId = Number(placement.lesson_id)
        const topicId = Number(placement.topic_id)
        const isMoved = type === 'topic'
          ? topicId === sourceTopicId || movedLessonIds.has(lessonId)
          : movedLessonIds.has(lessonId)
        if (!isMoved) return placement

        const nextPlacement = type === 'topic'
          ? {
              ...placement,
              programme: destinationProgramme,
              topic_title: movedTopicTitle ?? placement.topic_title,
            }
          : {
              ...placement,
              topic_id: destinationTopic?.id ?? placement.topic_id,
              programme: destinationTopic?.programme ?? placement.programme,
              topic_title: destinationTopic?.title ?? placement.topic_title,
              lesson_title: resource?.title ?? placement.lesson_title ?? lessonById.get(lessonId)?.title,
            }
        affectedPlacements.push(nextPlacement)
        return nextPlacement
      })
      if (!affectedPlacements.length) return null
      return {
        lecture,
        previousPlacements,
        nextPlacements,
        affectedPlacements,
        change: audienceChangeForLecture(lecture, nextPlacements),
      }
    })
    .filter(Boolean)
}

export function isStaleError(error) {
  return error?.status === 409 && ['CURRICULUM_CHANGED', 'CURRICULUM_RELOAD_REQUIRED'].includes(error?.code)
}

export function freezeRevision(navigationRevision, libraryRevision) {
  const values = [navigationRevision, libraryRevision].filter((value) => Number.isSafeInteger(value))
  return values.length ? Math.min(...values) : 0
}

export function sortedByOrder(items) {
  return [...(items ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0) || (a.placement_id ?? a.id) - (b.placement_id ?? b.id))
}

export function minRevisionFromResponses(...responses) {
  const revisions = responses
    .map((response) => normaliseRevision(response, null))
    .filter((value) => Number.isSafeInteger(value))
  return revisions.length ? Math.min(...revisions) : null
}
