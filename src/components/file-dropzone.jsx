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
 *   id              — string  — forwarded to the hidden input for label association
 *   accept          — string  — input accept attribute (e.g. ".pdf", "image/jpeg,image/png")
 *   hint            — string  — caption shown inside the dropzone
 *   file            — File|null
 *   onChange        — (File|null) => void
 *   disabled        — boolean
 *   icon            — Lucide icon component (default: FileUp)
 *   title           — primary label inside the dropzone (default: 'Drop a file here or click to pick')
 *   capture         — input capture attribute (e.g. 'environment' for mobile camera)
 *   inputAriaLabel  — aria-label on the hidden input (overrides default association via id)
 *   size            — 'default' | 'lg' — controls padding + icon size
 *   showPickedFile  — boolean — when false, the consumer renders its own picked-file UI
 *                     (the dropzone unmounts once a file is selected). Default: true.
 */
export default function FileDropzone({
  id,
  accept,
  hint,
  file,
  onChange,
  disabled = false,
  icon: Icon = FileUp,
  title = 'Drop a file here or click to pick',
  capture,
  inputAriaLabel,
  size = 'default',
  showPickedFile = true,
}) {
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

  if (file && showPickedFile) {
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

  // When showPickedFile=false and a file is already picked, the consumer is
  // rendering its own preview; we should not render the dropzone at all.
  if (file && !showPickedFile) return null

  const padding = size === 'lg' ? 'px-6 py-10' : 'px-4 py-6'
  const iconSize = size === 'lg' ? 'h-7 w-7' : 'h-6 w-6'
  const gap = size === 'lg' ? 'gap-2' : 'gap-1.5'
  const bg = size === 'lg' ? 'bg-muted/30 hover:bg-muted/50' : 'bg-muted/20 hover:bg-muted/40'

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        onChange={handleInputChange}
        className="sr-only"
        disabled={disabled}
        tabIndex={-1}
        aria-label={inputAriaLabel}
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
        className={`flex flex-col items-center justify-center ${gap} rounded-lg border-2 border-dashed border-input ${bg} ${padding} text-center transition-colors ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        }`}
      >
        <Icon className={`${iconSize} text-muted-foreground`} />
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </>
  )
}
