export const GRADES = [10, 11, 12, 'dgnl']
export const MATHS_GRADES = [10, 11, 12, 'thpt', 'dgnl']
const LEGACY_GRADES_ERROR = 'grades must be a non-empty array containing only 10, 11, 12, or dgnl'
const MATHS_GRADES_ERROR = 'grades must be a non-empty array containing only 10, 11, 12, thpt, or dgnl'

function allowedGrades({ workspaceId } = {}) {
  return workspaceId === 'maths' ? MATHS_GRADES : GRADES
}

function gradesError(grades) {
  return grades.includes('thpt') ? MATHS_GRADES_ERROR : LEGACY_GRADES_ERROR
}

function sortGrades(grades, options) {
  return allowedGrades(options).filter((grade) => grades.includes(grade))
}

export function parseGrades(value, { defaultToAll = false, workspaceId } = {}) {
  const options = { workspaceId }
  const grades = allowedGrades(options)
  if (value === undefined && defaultToAll) {
    return { grades: [...grades] }
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { error: gradesError(grades) }
  }

  if (value.some((grade) => !grades.includes(grade))) {
    return { error: gradesError(grades) }
  }

  return { grades: sortGrades([...new Set(value)], options) }
}

export function attachGrades(items, gradeRows, idKey, options = {}) {
  const gradesById = new Map()
  for (const row of gradeRows) {
    const grades = gradesById.get(row[idKey]) || []
    grades.push(row.grade)
    gradesById.set(row[idKey], grades)
  }

  return items.map((item) => ({
    ...item,
    grades: sortGrades(gradesById.get(item.id) || [], options),
  }))
}
