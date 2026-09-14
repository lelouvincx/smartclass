import { GRADES, MATHS_GRADES, gradesForWorkspace, hasAllGrades, sortGrades } from './grades'

describe('frontend programme choices', () => {
  it('keeps the legacy global programme list at four choices', () => {
    expect(GRADES).toEqual([10, 11, 12, 'dgnl'])
  })

  it('resolves maths to five choices and English to four choices by workspace id', () => {
    expect(MATHS_GRADES).toEqual([10, 11, 12, 'thpt', 'dgnl'])
    expect(gradesForWorkspace({ id: 'maths' })).toEqual(MATHS_GRADES)
    expect(gradesForWorkspace('english')).toEqual(GRADES)
  })

  it('does not treat an existing all-four selection as all-five for maths', () => {
    expect(hasAllGrades([10, 11, 12, 'dgnl'], gradesForWorkspace('maths'))).toBe(false)
    expect(hasAllGrades([10, 11, 12, 'thpt', 'dgnl'], gradesForWorkspace('maths'))).toBe(true)
  })

  it('sorts and bounds choices to the current workspace programmes', () => {
    expect(sortGrades(['dgnl', 'thpt', 10], gradesForWorkspace('maths'))).toEqual([10, 'thpt', 'dgnl'])
    expect(sortGrades(['dgnl', 'thpt', 10], gradesForWorkspace('english'))).toEqual([10, 'dgnl'])
  })
})
