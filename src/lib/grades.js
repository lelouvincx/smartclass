export const GRADES = [10, 11, 12, 'dgnl']

export function hasAllGrades(grades) {
  return GRADES.every((grade) => grades?.includes(grade))
}

export function sortGrades(grades) {
  return GRADES.filter((grade) => grades.includes(grade))
}
