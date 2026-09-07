export const GRADES = [10, 11, 12, 'dgnl']
export const DEFAULT_STUDENT_GRADES = [12]

export function hasAllGrades(grades) {
  return GRADES.every((grade) => grades?.includes(grade))
}

export function sortGrades(grades) {
  return GRADES.filter((grade) => grades.includes(grade))
}
