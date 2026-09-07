import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FileDropzone from './file-dropzone'

function makeFile(name = 'doc.pdf', type = 'application/pdf', size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('FileDropzone', () => {
  it('renders default empty-state copy and icon', () => {
    render(<FileDropzone file={null} onChange={() => {}} />)
    expect(screen.getByText(/Drop a file here or click to pick/i)).toBeInTheDocument()
  })

  it('renders custom title + hint when provided', () => {
    render(
      <FileDropzone
        file={null}
        onChange={() => {}}
        title="Drop a photo here or click to pick"
        hint="JPEG or PNG, up to 20 MB"
      />,
    )
    expect(screen.getByText(/Drop a photo here/i)).toBeInTheDocument()
    expect(screen.getByText(/JPEG or PNG/i)).toBeInTheDocument()
  })

  it('forwards inputAriaLabel + capture to the hidden input', () => {
    render(
      <FileDropzone
        file={null}
        onChange={() => {}}
        accept="image/jpeg,image/png"
        capture="environment"
        inputAriaLabel="Pick or capture answer sheet image"
      />,
    )
    const input = screen.getByLabelText(/Pick or capture answer sheet image/i)
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('capture', 'environment')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png')
  })

  it('calls onChange when a file is picked via the hidden input', () => {
    const onChange = vi.fn()
    render(
      <FileDropzone
        file={null}
        onChange={onChange}
        inputAriaLabel="picker"
      />,
    )
    const input = screen.getByLabelText('picker')
    const file = makeFile()
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    fireEvent.change(input)
    expect(onChange).toHaveBeenCalledWith(file)
  })

  it('calls onChange when a file is dropped on the dropzone', () => {
    const onChange = vi.fn()
    render(<FileDropzone file={null} onChange={onChange} />)
    const dz = screen.getByRole('button')
    const file = makeFile()
    fireEvent.drop(dz, { dataTransfer: { files: [file] } })
    expect(onChange).toHaveBeenCalledWith(file)
  })

  it('triggers the picker on Enter/Space when focused', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <FileDropzone
        file={null}
        onChange={onChange}
        inputAriaLabel="picker"
      />,
    )
    const dz = screen.getByRole('button')
    const input = screen.getByLabelText('picker')
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

    dz.focus()
    await user.keyboard('{Enter}')
    expect(clickSpy).toHaveBeenCalled()

    clickSpy.mockClear()
    await user.keyboard(' ')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('renders the picked-file row with name, size, and a Remove button', () => {
    const file = makeFile('exam.pdf', 'application/pdf', 2048)
    render(<FileDropzone file={file} onChange={() => {}} />)
    expect(screen.getByText('exam.pdf')).toBeInTheDocument()
    expect(screen.getByText(/KB|B/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove file/i })).toBeInTheDocument()
  })

  it('clears the file when Remove is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const file = makeFile()
    render(<FileDropzone file={file} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /remove file/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders nothing when showPickedFile=false and a file is set (consumer renders own preview)', () => {
    const file = makeFile()
    const { container } = render(
      <FileDropzone file={file} onChange={() => {}} showPickedFile={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn()
    render(<FileDropzone file={null} onChange={onChange} disabled />)
    const dz = screen.getByRole('button')
    fireEvent.drop(dz, { dataTransfer: { files: [makeFile()] } })
    expect(onChange).not.toHaveBeenCalled()
    expect(dz).toHaveAttribute('tabindex', '-1')
  })
})
