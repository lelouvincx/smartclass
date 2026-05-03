import React, { useRef } from 'react'
import { FileUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Controlled drag-and-drop file picker.
 *
 * Props:
 *   id        — string  — forwarded to the hidden input for label association
 *   accept    — string  — input accept attribute (e.g. ".pdf")
 *   hint      — string  — caption shown inside the dropzone
 *   file      — File|null
 *   onChange  — (File|null) => void
 *   disabled  — boolean
 */
export default function FileDropzone({ id, accept, hint, file, onChange, disabled = false }) {
  const inputRef = useRef(null)

  function pick(picked) {
    if (!picked || disabled) return
    onChange(picked)
  }

  function handleInputChange(e) {
    pick(e.target.files?.[0] || null)
  }

  function handleDrop(e) {
    e.preventDefault()
    if (disabled) return
    pick(e.dataTransfer.files?.[0] || null)
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
        <div className="min-w-0">
          <p className="truncate font-medium" title={file.name}>{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleClear}
          disabled={disabled}
          aria-label="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
        disabled={disabled}
        tabIndex={-1}
      />
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-input bg-muted/20 px-4 py-6 text-center transition-colors hover:bg-muted/40 ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      >
        <FileUp className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drop a file here or click to pick</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </>
  )
}
