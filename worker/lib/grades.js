export const GRADES = [10, 11, 12, 'dgnl']
const GRADES_ERROR = 'grades must be a non-empty array containing only 10, 11, 12, or dgnl'

function sortGrades(grades) {
  return GRADES.filter((grade) => grades.includes(grade))
}

export function parseGrades(value, { defaultToAll = false } = {}) {
  if (value === undefined && defaultToAll) {
    return { grades: [...GRADES] }
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { error: GRADES_ERROR }
  }

  if (value.some((grade) => !GRADES.includes(grade))) {
    return { error: GRADES_ERROR }
  }

  return { grades: sortGrades([...new Set(value)]) }
}

export function attachGrades(items, gradeRows, idKey) {
  const gradesById = new Map()
  for (const row of gradeRows) {
    const grades = gradesById.get(row[idKey]) || []
    grades.push(row.grade)
    gradesById.set(row[idKey], grades)
  }

  return items.map((item) => ({
    ...item,
    grades: sortGrades(gradesById.get(item.id) || []),
  }))
}
