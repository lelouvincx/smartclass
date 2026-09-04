export const GRADES = [10, 11, 12]

export function hasAllGrades(grades) {
  return GRADES.every((grade) => grades?.includes(grade))
}
