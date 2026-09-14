export const GRADES = [10, 11, 12, 'dgnl']
export const MATHS_GRADES = [10, 11, 12, 'thpt', 'dgnl']
export const DEFAULT_STUDENT_GRADES = [12]

export function workspaceIdOf(workspace) {
  if (typeof workspace === 'string') return workspace
  return workspace?.id ?? null
}

export function gradesForWorkspace(workspace) {
  return workspaceIdOf(workspace) === 'maths' ? MATHS_GRADES : GRADES
}

export function hasAllGrades(grades, availableGrades = GRADES) {
  return availableGrades.every((grade) => grades?.includes(grade))
}

export function sortGrades(grades, availableGrades = GRADES) {
  return availableGrades.filter((grade) => grades.includes(grade))
}
