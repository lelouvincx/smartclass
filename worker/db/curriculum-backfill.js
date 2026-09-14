import { getWorkspaceCutoverStatus } from './workspace-cutover.js'

const PROGRAMME_ORDER = [10, 11, 12, 'thpt', 'dgnl']
const PROGRAMMES = new Set(PROGRAMME_ORDER)
const ACCESS_TIERS = new Set(['guest', 'standard', 'vip'])

function fail(message) {
  throw new Error(`Curriculum backfill refused: ${message}`)
}

async function rows(db, sql, ...bindings) {
  return (await db.prepare(sql).bind(...bindings).all()).results
}

function assertArray(value, name) {
  if (!Array.isArray(value)) fail(`${name} must be an array`)
}

function assertInteger(value, name) {
  if (!Number.isInteger(value)) fail(`${name} must be an integer`)
}

function normalizeProgramme(value) {
  return typeof value === 'number' ? value : String(value)
}

function sortProgrammes(programmes) {
  return [...programmes].map(normalizeProgramme).sort((left, right) => (
    PROGRAMME_ORDER.indexOf(left) - PROGRAMME_ORDER.indexOf(right)
  ))
}

function sameProgrammeSet(left, right) {
  const leftSorted = sortProgrammes(left)
  const rightSorted = sortProgrammes(right)
  return leftSorted.length === rightSorted.length
    && leftSorted.every((programme, index) => programme === rightSorted[index])
}

function assertProgramme(value, label) {
  const normal = normalizeProgramme(value)
  if (!PROGRAMMES.has(normal)) fail(`${label} has unknown programme ${value}`)
  return normal
}

function assertUnique(values, label) {
  const seen = new Set()
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate ${label} ${value}`)
    seen.add(value)
  }
}

function assertContiguousOrder(rowsToCheck, parentOf, label) {
  const byParent = new Map()
  for (const row of rowsToCheck) {
    assertInteger(row?.order_index, `${label} order_index`)
    if (row.order_index < 0) fail(`${label} order_index must be non-negative`)
    const parent = parentOf(row)
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent).push(row.order_index)
  }
  for (const [parent, indexes] of byParent) {
    const sorted = indexes.toSorted((left, right) => left - right)
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index) fail(`${label} order for ${parent} must be contiguous zero-based`)
    }
  }
}

function validateMappingShape(mapping) {
  if (!mapping || typeof mapping !== 'object') fail('mapping must be an object')
  if (mapping.workspace_id !== 'maths') fail("mapping workspace_id must be exactly 'maths'")
  if (mapping.reviewer !== 'Chinh') fail('mapping reviewer must be Chinh')
  assertArray(mapping.expected_source_order, 'expected_source_order')
  assertArray(mapping.topics, 'topics')
  assertArray(mapping.lessons, 'lessons')
  assertArray(mapping.lectures, 'lectures')
  if (JSON.stringify(mapping.expected_source_order) !== JSON.stringify([1, 2, 3, 4, 5, 6])) {
    fail('expected source relative order must be [1,2,3,4,5,6]')
  }

  assertUnique(mapping.topics.map((topic) => topic?.key), 'topic key')
  assertUnique(mapping.lessons.map((lesson) => lesson?.key), 'lesson key')
  assertUnique(mapping.lectures.map((lecture) => lecture?.id), 'lecture id')

  const topicKeys = new Set(mapping.topics.map((topic) => topic.key))
  const lessonKeys = new Set(mapping.lessons.map((lesson) => lesson.key))
  for (const topic of mapping.topics) {
    if (!topic?.key || typeof topic.key !== 'string') fail('topic key must be a string')
    assertProgramme(topic.programme, `topic ${topic.key}`)
    if (!topic.title || typeof topic.title !== 'string' || topic.title.trim() === '') {
      fail(`topic ${topic.key} title must be non-empty`)
    }
  }
  for (const lesson of mapping.lessons) {
    if (!lesson?.key || typeof lesson.key !== 'string') fail('lesson key must be a string')
    if (!topicKeys.has(lesson.topic_key)) fail(`lesson ${lesson.key} references missing topic ${lesson.topic_key}`)
    if (!lesson.title || typeof lesson.title !== 'string' || lesson.title.trim() === '') {
      fail(`lesson ${lesson.key} title must be non-empty`)
    }
  }
  for (const lecture of mapping.lectures) {
    assertInteger(lecture?.id, 'lecture id')
    if (!lecture.title || typeof lecture.title !== 'string') fail(`lecture ${lecture.id} title must be a string`)
    if (!lecture.youtube_url || typeof lecture.youtube_url !== 'string') fail(`lecture ${lecture.id} youtube_url must be a string`)
    if (!ACCESS_TIERS.has(lecture.minimum_access_tier)) fail(`lecture ${lecture.id} has invalid tier`)
    if (![0, 1].includes(lecture.is_visible)) fail(`lecture ${lecture.id} has invalid visibility`)
    assertArray(lecture.programmes, `lecture ${lecture.id} programmes`)
    assertUnique(lecture.programmes.map(normalizeProgramme), `lecture ${lecture.id} programme`)
    for (const programme of lecture.programmes) assertProgramme(programme, `lecture ${lecture.id}`)
    assertArray(lecture.placements, `lecture ${lecture.id} placements`)
    const placementKeys = []
    for (const placement of lecture.placements) {
      if (!lessonKeys.has(placement?.lesson_key)) {
        fail(`lecture ${lecture.id} placement references missing lesson ${placement?.lesson_key}`)
      }
      placementKeys.push(placement.lesson_key)
    }
    assertUnique(placementKeys, `lecture ${lecture.id} placement lesson`)
  }
  assertContiguousOrder(mapping.topics, (topic) => assertProgramme(topic.programme, `topic ${topic.key}`), 'topic')
  assertContiguousOrder(mapping.lessons, (lesson) => lesson.topic_key, 'lesson')
  assertContiguousOrder(
    mapping.lectures.flatMap((lecture) => lecture.placements.map((placement) => ({ ...placement, lecture_id: lecture.id }))),
    (placement) => placement.lesson_key,
    'placement',
  )
}

async function readCurrentState(db, mapping) {
  const idList = mapping.lectures.map((lecture) => lecture.id)
  const placeholders = idList.map(() => '?').join(', ')
  const [lectureRows, gradeRows, workspace, curriculumCounts, foreignKeys, orderRows] = await Promise.all([
    rows(db, `select id, workspace_id, title, youtube_url, order_index, is_visible, minimum_access_tier
      from lectures where workspace_id = ? or id in (${placeholders}) order by id`, mapping.workspace_id, ...idList),
    rows(db, `select lecture_id, grade from lecture_grades where lecture_id in (${placeholders}) order by lecture_id, grade`, ...idList),
    db.prepare("select id, curriculum_revision from workspaces where id = 'maths'").first(),
    db.prepare(`select
      (select count(*) from curriculum_topics where workspace_id = 'maths') as topics,
      (select count(*) from curriculum_lessons where workspace_id = 'maths') as lessons,
      (select count(*) from lecture_placements where workspace_id = 'maths') as placements`).first(),
    rows(db, 'pragma foreign_key_check'),
    rows(db, `select id from lectures where id in (${placeholders}) order by order_index, id`, ...idList),
  ])
  return { lectureRows, gradeRows, workspace, curriculumCounts, foreignKeys, orderRows }
}

function programmesByLecture(gradeRows) {
  const byLecture = new Map()
  for (const row of gradeRows) {
    if (!byLecture.has(row.lecture_id)) byLecture.set(row.lecture_id, [])
    byLecture.get(row.lecture_id).push(normalizeProgramme(row.grade))
  }
  return byLecture
}

function targetProgrammes(mapping) {
  const lessonTopic = new Map(mapping.lessons.map((lesson) => [lesson.key, lesson.topic_key]))
  const topicProgramme = new Map(mapping.topics.map((topic) => [topic.key, assertProgramme(topic.programme, `topic ${topic.key}`)]))
  const result = new Map()
  for (const lecture of mapping.lectures) {
    result.set(lecture.id, sortProgrammes(new Set(lecture.placements.map((placement) => (
      topicProgramme.get(lessonTopic.get(placement.lesson_key))
    )))))
  }
  return result
}

function validateAudience(mapping, currentProgrammes) {
  const targets = targetProgrammes(mapping)
  return mapping.lectures.map((lecture) => {
    const before = sortProgrammes(currentProgrammes.get(lecture.id) ?? [])
    const after = sortProgrammes(targets.get(lecture.id) ?? [])
    const approved = lecture.approved_audience_change ?? null
    if (!sameProgrammeSet(before, after)) {
      if (!approved || approved.reviewer !== 'Chinh'
        || !sameProgrammeSet(approved.before ?? [], before)
        || !sameProgrammeSet(approved.after ?? [], after)) {
        fail(`lecture ${lecture.id} audience change requires exact Chinh approval`)
      }
    } else if (approved !== null) {
      fail(`lecture ${lecture.id} audience approval is present without a programme change`)
    }
    return { lecture_id: lecture.id, before, after, approved_change: approved }
  })
}

async function validateReviewedState(db, mapping) {
  validateMappingShape(mapping)
  const state = await readCurrentState(db, mapping)
  if (state.foreignKeys.length > 0) fail('existing foreign key corruption must be repaired before backfill')
  if (!state.workspace) fail('maths workspace is missing')
  if (state.workspace.curriculum_revision !== 0) fail('target workspace curriculum_revision is not zero')
  if (state.curriculumCounts.topics !== 0 || state.curriculumCounts.lessons !== 0 || state.curriculumCounts.placements !== 0) {
    fail('target workspace curriculum is not empty')
  }

  const byId = new Map(state.lectureRows.map((lecture) => [lecture.id, lecture]))
  const currentProgrammes = programmesByLecture(state.gradeRows)
  for (const lecture of mapping.lectures) {
    const current = byId.get(lecture.id)
    if (!current) fail(`source lecture ${lecture.id} is missing`)
    if (current.workspace_id !== mapping.workspace_id) fail(`source lecture ${lecture.id} workspace ownership mismatch`)
    for (const field of ['title', 'youtube_url', 'minimum_access_tier', 'is_visible']) {
      if (current[field] !== lecture[field]) fail(`source lecture ${lecture.id} ${field} drifted`)
    }
    if (!sameProgrammeSet(currentProgrammes.get(lecture.id) ?? [], lecture.programmes)) {
      fail(`source lecture ${lecture.id} programmes drifted`)
    }
  }
  if (state.lectureRows.length !== mapping.lectures.length) fail('source lecture rows are incomplete')
  const sourceOrder = state.orderRows.map((row) => row.id)
  if (JSON.stringify(sourceOrder) !== JSON.stringify(mapping.expected_source_order)) {
    fail('source relative order drifted')
  }
  const cutover = await getWorkspaceCutoverStatus(db)
  if (!cutover.complete) fail('workspace cutover is not complete')
  const audience = validateAudience(mapping, currentProgrammes)
  return {
    workspace_id: mapping.workspace_id,
    revision_before: state.workspace.curriculum_revision,
    topics: mapping.topics.length,
    lessons: mapping.lessons.length,
    placements: mapping.lectures.reduce((total, lecture) => total + lecture.placements.length, 0),
    audience,
  }
}

function buildStatements(db, mapping, expectedRevision) {
  const topicByKey = new Map(mapping.topics.map((topic) => [topic.key, topic]))
  const lessonByKey = new Map(mapping.lessons.map((lesson) => [lesson.key, lesson]))
  const statements = [
    db.prepare("update workspaces set curriculum_revision = curriculum_revision + 1 where id = 'maths' and curriculum_revision = ?")
      .bind(expectedRevision),
    db.prepare("insert into curriculum_topics (id, workspace_id, programme, title, order_index) select 0, 'maths', 10, 'stale revision guard', 0 where changes() <> 1"),
  ]
  for (const topic of mapping.topics) {
    statements.push(db.prepare(`
      insert into curriculum_topics (workspace_id, programme, title, order_index)
      values ('maths', ?, ?, ?)
    `).bind(topic.programme, topic.title, topic.order_index))
  }
  for (const lesson of mapping.lessons) {
    const topic = topicByKey.get(lesson.topic_key)
    statements.push(db.prepare(`
      insert into curriculum_lessons (workspace_id, topic_id, title, order_index)
      values ('maths', (
        select id from curriculum_topics
        where workspace_id = 'maths' and programme = ? and order_index = ?
      ), ?, ?)
    `).bind(topic.programme, topic.order_index, lesson.title, lesson.order_index))
  }
  for (const lecture of mapping.lectures) {
    for (const placement of lecture.placements) {
      const lesson = lessonByKey.get(placement.lesson_key)
      const topic = topicByKey.get(lesson.topic_key)
      statements.push(db.prepare(`
        insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index)
        values ('maths', (
          select l.id from curriculum_lessons l
          join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
          where l.workspace_id = 'maths' and t.programme = ? and t.order_index = ? and l.order_index = ?
        ), ?, ?)
      `).bind(topic.programme, topic.order_index, lesson.order_index, lecture.id, placement.order_index))
    }
  }
  return statements
}

/**
 * Validates Chinh's reviewed RFC-18 maths curriculum placement mapping without writing rows.
 * Caller must keep the documented maintenance freeze across this read, any later apply, and checks.
 */
export async function validateCurriculumBackfill(db, mapping) {
  return validateReviewedState(db, structuredClone(mapping))
}

/**
 * Applies the reviewed RFC-18 maths curriculum placement mapping in one D1 batch.
 * Preconditions: maintenance freeze is active, RFC-17 workspace cutover is complete, source rows still
 * match the reviewed mapping, maths curriculum is empty, and maths curriculum_revision is zero.
 */
export async function backfillCurriculum(db, mapping) {
  const reviewed = structuredClone(mapping)
  const dryRun = await validateReviewedState(db, reviewed)
  await db.batch(buildStatements(db, reviewed, dryRun.revision_before))
  return { ...dryRun, revision_after: dryRun.revision_before + 1 }
}
