import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CurriculumNavigator } from './curriculum-navigator'

const navigation = {
  programme: 12,
  programmes: [10, 11, 12, 'thpt', 'dgnl'],
  topics: [
    { id: 1, title: 'Topic actions target', lessons: [{ id: 11, title: 'Lesson actions target', unit_count: 1 }] },
  ],
  selectedTopic: { id: 1, title: 'Topic actions target' },
  selectedLesson: { id: 11, title: 'Lesson actions target', unit_count: 1 },
  lessonDetail: {
    units: [
      {
        placement_id: 101,
        lecture: { id: 201, title: 'Unit actions target', youtube_url: 'https://youtu.be/abcdefghijk' },
      },
    ],
  },
  revision: 4,
  loading: false,
  lessonLoading: false,
  error: '',
  selectProgramme: vi.fn(),
  selectTopic: vi.fn(),
  selectLesson: vi.fn(),
  backToTopics: vi.fn(),
  reload: vi.fn(),
}

describe('CurriculumNavigator', () => {
  it('resizes the desktop curriculum panes with a draggable separator and clamps the navigation width', () => {
    render(<MemoryRouter><CurriculumNavigator navigation={navigation} /></MemoryRouter>)
    const layout = screen.getByTestId('curriculum-split-layout')
    layout.getBoundingClientRect = () => ({ width: 1000, height: 600, left: 0, top: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => {} })
    const separator = screen.getByRole('separator', { name: 'Resize topics and lesson panes' })

    expect(separator).toHaveAttribute('aria-orientation', 'vertical')
    expect(separator).toHaveAttribute('aria-valuemin', '26')
    expect(separator).toHaveAttribute('aria-valuemax', '67')
    expect(separator).toHaveAttribute('aria-valuenow', '43')

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 900 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 900 })
    fireEvent.pointerUp(separator, { pointerId: 1 })
    expect(separator).toHaveAttribute('aria-valuenow', '67')
    expect(layout).toHaveStyle({ '--curriculum-navigation-width': '66.8%' })

    fireEvent.pointerDown(separator, { pointerId: 2, clientX: 50 })
    fireEvent.pointerMove(separator, { pointerId: 2, clientX: 50 })
    fireEvent.pointerUp(separator, { pointerId: 2 })
    expect(separator).toHaveAttribute('aria-valuenow', '26')
    expect(layout).toHaveStyle({ '--curriculum-navigation-width': '25.6%' })
  })

  it('resizes the desktop curriculum panes from the keyboard', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><CurriculumNavigator navigation={navigation} /></MemoryRouter>)
    const layout = screen.getByTestId('curriculum-split-layout')
    layout.getBoundingClientRect = () => ({ width: 1000, height: 600, left: 0, top: 0, right: 1000, bottom: 600, x: 0, y: 0, toJSON: () => {} })
    const separator = screen.getByRole('separator', { name: 'Resize topics and lesson panes' })

    separator.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(separator).toHaveAttribute('aria-valuenow', '53')
    await user.keyboard('{ArrowLeft}')
    expect(separator).toHaveAttribute('aria-valuenow', '48')
    await user.keyboard('{Home}')
    expect(separator).toHaveAttribute('aria-valuenow', '26')
    await user.keyboard('{End}')
    expect(separator).toHaveAttribute('aria-valuenow', '67')
  })

  it('removes the draggable lesson divider when the desktop navigation is collapsed', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><CurriculumNavigator navigation={navigation} /></MemoryRouter>)
    expect(screen.getByRole('separator', { name: 'Resize topics and lesson panes' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hide topics and lessons' }))
    expect(screen.queryByRole('separator', { name: 'Resize topics and lesson panes' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Topics and lessons' })).toHaveClass('lg:hidden')
  })

  it('uses the shared programme select and changes programme by keyboard', async () => {
    const user = userEvent.setup()
    Element.prototype.scrollIntoView ??= () => {}
    render(<MemoryRouter><CurriculumNavigator navigation={navigation} /></MemoryRouter>)
    const select = screen.getByRole('combobox', { name: 'Programme' })
    expect(select).toHaveAttribute('data-slot', 'select-trigger')
    select.focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('option', { name: 'Grade 12' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(navigation.selectProgramme).toHaveBeenCalledWith('thpt')
    expect(select).toHaveFocus()
  })

  it('toggles the desktop navigation without changing the selected lesson', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><CurriculumNavigator navigation={navigation} management={{ lessonActions: () => <button>Lesson menu</button> }} /></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'Hide topics and lessons' })
    const pane = screen.getByRole('navigation', { name: 'Topics and lessons' })
    expect(toggle).toHaveAttribute('aria-controls', pane.id)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Show topics and lessons')
    expect(pane).toHaveClass('lg:hidden')
    expect(pane.parentElement).not.toHaveClass('lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]')
    expect(screen.getByRole('heading', { name: 'Lesson actions target' })).toBeInTheDocument()
    expect(within(screen.getByTestId('curriculum-desktop-lesson-header-actions')).getByRole('button', { name: 'Lesson menu' })).toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(pane).toHaveClass('lg:block')
  })

  it('separates mobile drill-in panes and labels a hidden VIP video', () => {
    const hiddenUnit = { placement_id: 101, lecture: { id: 201, title: 'Hidden unit', is_visible: 0, minimum_access_tier: 'vip' } }
    render(<MemoryRouter><CurriculumNavigator navigation={{ ...navigation, lessonDetail: { units: [hiddenUnit] } }} audience="teacher" /></MemoryRouter>)
    expect(screen.getByRole('navigation', { name: 'Topics and lessons' })).toHaveClass('hidden', 'lg:block')
    expect(screen.getByText('Hidden')).toBeInTheDocument()
    expect(screen.getByText('VIP')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Watch unit 1: Hidden unit' })).toHaveAttribute('href', '/teacher/lectures/201-hidden-unit?placement=101')
  })

  it('renders teacher-provided management slots without built-in CRUD prompts', () => {
    render(
      <MemoryRouter>
        <CurriculumNavigator
          navigation={navigation}
          audience="teacher"
          management={{
            programmeActions: <button type="button">Programme action</button>,
            topicActions: (topic) => <button type="button">Edit {topic.title}</button>,
            lessonActions: (lesson) => <button type="button">Edit {lesson.title}</button>,
            unitActions: (unit) => <button type="button">Edit {unit.lecture.title}</button>,
            lessonHeaderActions: <button type="button">Lesson header action</button>,
            footer: <button type="button">Footer action</button>,
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: 'Programme action' })).toBeInTheDocument()
    const navigator = screen.getByRole('navigation', { name: 'Topics and lessons' })
    expect(within(navigator).getByRole('button', { name: 'Edit Topic actions target' })).toBeInTheDocument()
    expect(within(navigator).getByRole('button', { name: 'Edit Lesson actions target' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit Unit actions target' })).toBeInTheDocument()
    expect(within(screen.getByTestId('curriculum-desktop-lesson-header-actions')).getByRole('button', { name: 'Lesson header action' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Footer action' })).toBeInTheDocument()
    expect(screen.queryByText(/delete|confirm|prompt/i)).not.toBeInTheDocument()
  })

  it('keeps lesson management available in the mobile lesson header while preserving the desktop lesson menu', () => {
    render(
      <MemoryRouter>
        <CurriculumNavigator
          navigation={navigation}
          audience="teacher"
          management={{
            lessonActions: () => <button type="button">Lesson management menu</button>,
            lessonHeaderActions: <button type="button">Add video</button>,
          }}
        />
      </MemoryRouter>,
    )

    const navigator = screen.getByRole('navigation', { name: 'Topics and lessons' })
    expect(within(navigator).getByRole('button', { name: 'Lesson management menu' })).toBeInTheDocument()

    const mobileHeaderActions = screen.getByTestId('curriculum-mobile-lesson-actions')
    expect(mobileHeaderActions).toHaveClass('lg:hidden')
    expect(within(mobileHeaderActions).getByRole('button', { name: 'Lesson management menu' })).toBeInTheDocument()
    expect(within(mobileHeaderActions).getByRole('button', { name: 'Add video' })).toBeInTheDocument()
  })
})
