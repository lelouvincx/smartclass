export const GRADES = [10, 11, 12]

export function parseGrades(value, { defaultToAll = false } = {}) {
  if (value === undefined && defaultToAll) {
    return { grades: [...GRADES] }
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'grades must be a non-empty array containing only 10, 11, or 12' }
  }

  if (value.some((grade) => !Number.isInteger(grade) || !GRADES.includes(grade))) {
    return { error: 'grades must be a non-empty array containing only 10, 11, or 12' }
  }

  return { grades: [...new Set(value)].sort((left, right) => left - right) }
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
    grades: gradesById.get(item.id) || [],
  }))
}
