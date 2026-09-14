import { getWorkspaceCutoverStatus } from './workspace-cutover.js'

export const CURRICULUM_CUTOVER_MARKER_SQL = `create table curriculum_cutover (
  id integer primary key check (id = 1)
  , workspace_id text not null check (workspace_id = 'maths')
  , mapping_sha256 text not null check (length(mapping_sha256) = 64)
  , completed_at text not null default current_timestamp
)`

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase()
}

async function rows(db, sql) {
  return (await db.prepare(sql).all()).results
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function sha256Hex(value) {
  const crypto = globalThis.crypto
  if (!crypto?.subtle) throw new Error('Curriculum cutover refused: crypto.subtle is unavailable')
  const bytes = new TextEncoder().encode(canonicalJson(value))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function getCurriculumMappingSha256(mapping) {
  return sha256Hex(mapping)
}

export async function getCurriculumCutoverStatus(db) {
  const workspace = await getWorkspaceCutoverStatus(db)
  if (!workspace.complete) return { complete: false, workspace_cutover_complete: false }

  const table = await db.prepare("select sql from sqlite_master where type = 'table' and name = 'curriculum_cutover'").first()
  if (!table || normalizeSql(table.sql) !== normalizeSql(CURRICULUM_CUTOVER_MARKER_SQL)) {
    return { complete: false, workspace_cutover_complete: true }
  }

  const markers = await rows(db, 'select id, workspace_id, mapping_sha256, completed_at from curriculum_cutover')
  if (markers.length !== 1 || markers[0].id !== 1 || markers[0].workspace_id !== 'maths'
    || !/^[a-f0-9]{64}$/.test(markers[0].mapping_sha256) || !markers[0].completed_at) {
    return { complete: false, workspace_cutover_complete: true }
  }

  const [foreignKeys, badPlacements] = await Promise.all([
    rows(db, 'pragma foreign_key_check'),
    db.prepare(`select count(*) as count
      from lecture_placements p
      left join curriculum_lessons l on l.id = p.lesson_id and l.workspace_id = p.workspace_id
      left join curriculum_topics t on t.id = l.topic_id and t.workspace_id = l.workspace_id
      left join lectures v on v.id = p.lecture_id and v.workspace_id = p.workspace_id
      where l.id is null or t.id is null or v.id is null`).first('count'),
  ])
  if (foreignKeys.length > 0 || badPlacements !== 0) {
    return { complete: false, workspace_cutover_complete: true, mapping_sha256: markers[0].mapping_sha256 }
  }
  return {
    complete: true,
    workspace_cutover_complete: true,
    workspace_id: markers[0].workspace_id,
    mapping_sha256: markers[0].mapping_sha256,
    completed_at: markers[0].completed_at,
  }
}
