import { getWorkspaceCutoverStatus } from './workspace-cutover.js'
import {
  CURRICULUM_CUTOVER_MARKER_SQL,
  getCurriculumMappingSha256,
} from './curriculum-cutover.js'

const PROGRAMME_ORDER = [10, 11, 12, 'thpt', 'dgnl']
const WORKSPACE_PROGRAMMES = new Map([
  ['maths', new Set(PROGRAMME_ORDER)],
  ['english', new Set([10, 11, 12, 'dgnl'])],
])
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

function assertProgramme(value, label, workspaceId = 'maths') {
  const normal = normalizeProgramme(value)
  const programmes = WORKSPACE_PROGRAMMES.get(workspaceId)
  if (!programmes?.has(normal)) fail(`${label} has unknown programme ${value}`)
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

function normalizeBackfillInput(input) {
  if (!input || typeof input !== 'object') fail('mapping must be an object')
  const workspaces = Object.prototype.hasOwnProperty.call(input, 'workspaces') ? input.workspaces : [input]
  assertArray(workspaces, 'workspaces')
  if (workspaces.length === 0) fail('workspaces must not be empty')
  assertUnique(workspaces.map((mapping) => mapping?.workspace_id), 'workspace_id')
  return { supplied: input, workspaces }
}

function validateMappingShape(mapping) {
  if (!mapping || typeof mapping !== 'object') fail('mapping must be an object')
  if (!WORKSPACE_PROGRAMMES.has(mapping.workspace_id)) fail('mapping workspace_id must be maths or english')
  if (mapping.reviewer !== 'Chinh') fail('mapping reviewer must be Chinh')
  assertArray(mapping.expected_source_order, 'expected_source_order')
  assertArray(mapping.topics, 'topics')
  assertArray(mapping.lessons, 'lessons')
  assertArray(mapping.lectures, 'lectures')
  assertUnique(mapping.expected_source_order, 'expected source id')
  const lectureIds = mapping.lectures.map((lecture) => lecture?.id)
  if (JSON.stringify([...mapping.expected_source_order].toSorted((left, right) => left - right))
    !== JSON.stringify([...lectureIds].toSorted((left, right) => left - right))) {
    fail('expected source order must be a complete unique permutation of mapped lectures')
  }

  assertUnique(mapping.topics.map((topic) => topic?.key), 'topic key')
  assertUnique(mapping.lessons.map((lesson) => lesson?.key), 'lesson key')
  assertUnique(mapping.lectures.map((lecture) => lecture?.id), 'lecture id')

  const topicKeys = new Set(mapping.topics.map((topic) => topic.key))
  const lessonKeys = new Set(mapping.lessons.map((lesson) => lesson.key))
  for (const topic of mapping.topics) {
    if (!topic?.key || typeof topic.key !== 'string') fail('topic key must be a string')
    assertProgramme(topic.programme, `topic ${topic.key}`, mapping.workspace_id)
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
    for (const programme of lecture.programmes) assertProgramme(programme, `lecture ${lecture.id}`, mapping.workspace_id)
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
  assertContiguousOrder(mapping.topics, (topic) => assertProgramme(topic.programme, `topic ${topic.key}`, mapping.workspace_id), 'topic')
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
      from lectures where id in (${placeholders}) order by id`, ...idList),
    rows(db, `select lecture_id, grade from lecture_grades where lecture_id in (${placeholders}) order by lecture_id, grade`, ...idList),
    db.prepare('select id, curriculum_revision from workspaces where id = ?').bind(mapping.workspace_id).first(),
    db.prepare(`select
      (select count(*) from curriculum_topics where workspace_id = ?) as topics,
      (select count(*) from curriculum_lessons where workspace_id = ?) as lessons,
      (select count(*) from lecture_placements where workspace_id = ?) as placements`).bind(mapping.workspace_id, mapping.workspace_id, mapping.workspace_id).first(),
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
  const topicProgramme = new Map(mapping.topics.map((topic) => [topic.key, assertProgramme(topic.programme, `topic ${topic.key}`, mapping.workspace_id)]))
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

async function validateReviewedWorkspace(db, mapping) {
  validateMappingShape(mapping)
  const state = await readCurrentState(db, mapping)
  if (state.foreignKeys.length > 0) fail('existing foreign key corruption must be repaired before backfill')
  if (!state.workspace) fail(`${mapping.workspace_id} workspace is missing`)
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

async function validateReviewedState(db, bundle) {
  const marker = await db.prepare("select name from sqlite_master where name = 'curriculum_cutover'").first()
  if (marker) fail('completion marker already exists; inspect before recovery')

  const allMappedLectureIds = []
  const summaries = []
  for (const mapping of bundle.workspaces) {
    summaries.push(await validateReviewedWorkspace(db, mapping))
    allMappedLectureIds.push(...mapping.lectures.map((lecture) => lecture.id))
  }
  assertUnique(allMappedLectureIds, 'lecture id')

  const existingLectures = await rows(db, 'select id, workspace_id from lectures order by id')
  const mapped = new Map(bundle.workspaces.flatMap((mapping) => (
    mapping.lectures.map((lecture) => [lecture.id, mapping.workspace_id])
  )))
  for (const lecture of existingLectures) {
    if (!mapped.has(lecture.id)) fail(`source lecture ${lecture.id} is absent from the reviewed mapping`)
    if (mapped.get(lecture.id) !== lecture.workspace_id) fail(`source lecture ${lecture.id} workspace ownership mismatch`)
  }
  if (existingLectures.length !== mapped.size) fail('reviewed mapping contains source lectures absent from the database')

  const cutover = await getWorkspaceCutoverStatus(db)
  if (!cutover.complete) fail('workspace cutover is not complete')

  return {
    workspace_id: summaries.length === 1 ? summaries[0].workspace_id : 'maths',
    workspaces: summaries,
    revision_before: summaries.length === 1 ? summaries[0].revision_before : Object.fromEntries(summaries.map((summary) => [summary.workspace_id, summary.revision_before])),
    topics: summaries.reduce((total, summary) => total + summary.topics, 0),
    lessons: summaries.reduce((total, summary) => total + summary.lessons, 0),
    placements: summaries.reduce((total, summary) => total + summary.placements, 0),
    audience: summaries.length === 1
      ? summaries[0].audience
      : summaries.flatMap((summary) => summary.audience.map((row) => ({ workspace_id: summary.workspace_id, ...row }))),
  }
}

async function buildWorkspaceStatements(db, mapping, expectedRevision) {
  const topicByKey = new Map(mapping.topics.map((topic) => [topic.key, topic]))
  const lessonByKey = new Map(mapping.lessons.map((lesson) => [lesson.key, lesson]))
  const statements = [
    db.prepare('update workspaces set curriculum_revision = curriculum_revision + 1 where id = ? and curriculum_revision = ?')
      .bind(mapping.workspace_id, expectedRevision),
    db.prepare(`insert into curriculum_topics (id, workspace_id, programme, title, order_index)
      select 0, ?, 10, 'stale revision guard', 0 where changes() <> 1`).bind(mapping.workspace_id),
  ]
  for (const topic of mapping.topics) {
    statements.push(db.prepare(`
      insert into curriculum_topics (workspace_id, programme, title, order_index)
      values (?, ?, ?, ?)
    `).bind(mapping.workspace_id, topic.programme, topic.title, topic.order_index))
  }
  for (const lesson of mapping.lessons) {
    const topic = topicByKey.get(lesson.topic_key)
    statements.push(db.prepare(`
      insert into curriculum_lessons (workspace_id, topic_id, title, order_index)
      values (?, (
        select id from curriculum_topics
        where workspace_id = ? and programme = ? and order_index = ?
      ), ?, ?)
    `).bind(mapping.workspace_id, mapping.workspace_id, topic.programme, topic.order_index, lesson.title, lesson.order_index))
  }
  for (const lecture of mapping.lectures) {
    for (const placement of lecture.placements) {
      const lesson = lessonByKey.get(placement.lesson_key)
      const topic = topicByKey.get(lesson.topic_key)
      statements.push(db.prepare(`
        insert into lecture_placements (workspace_id, lesson_id, lecture_id, order_index)
        values (?, (
          select l.id from curriculum_lessons l
          join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
          where l.workspace_id = ? and t.programme = ? and t.order_index = ? and l.order_index = ?
        ), ?, ?)
      `).bind(mapping.workspace_id, mapping.workspace_id, topic.programme, topic.order_index, lesson.order_index, lecture.id, placement.order_index))
    }
  }
  return statements
}

async function buildStatements(db, bundle, dryRun) {
  const mappingSha256 = await getCurriculumMappingSha256(bundle.supplied)
  const statements = []
  const expectedRevisions = new Map(dryRun.workspaces.map((workspace) => [workspace.workspace_id, workspace.revision_before]))
  for (const mapping of bundle.workspaces) {
    statements.push(...await buildWorkspaceStatements(db, mapping, expectedRevisions.get(mapping.workspace_id)))
  }
  // Retain the deployed gate's maths anchor; the hash covers every workspace in this batch.
  statements.push(
    db.prepare(CURRICULUM_CUTOVER_MARKER_SQL),
    db.prepare("insert into curriculum_cutover (id, workspace_id, mapping_sha256) values (1, 'maths', ?)")
      .bind(mappingSha256),
  )
  return statements
}

/**
 * Validates Chinh's reviewed RFC-18 workspace mappings without writing rows.
 * Caller must keep the documented maintenance freeze across this read, any later apply, and checks.
 */
export async function validateCurriculumBackfill(db, mapping) {
  return validateReviewedState(db, normalizeBackfillInput(structuredClone(mapping)))
}

/**
 * Applies all reviewed RFC-18 workspace mappings in one D1 batch.
 * Preconditions: maintenance freeze is active, RFC-17 workspace cutover is complete, source rows still
 * match the reviewed mappings, and each target curriculum is empty with revision zero.
 */
export async function backfillCurriculum(db, mapping) {
  const reviewed = normalizeBackfillInput(structuredClone(mapping))
  const dryRun = await validateReviewedState(db, reviewed)
  await db.batch(await buildStatements(db, reviewed, dryRun))
  const revisionAfter = dryRun.workspaces.length === 1
    ? dryRun.workspaces[0].revision_before + 1
    : Object.fromEntries(dryRun.workspaces.map((workspace) => [workspace.workspace_id, workspace.revision_before + 1]))
  return { ...dryRun, revision_after: revisionAfter }
}
