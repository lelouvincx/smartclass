import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Camera, ImagePlus, Loader2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import FileDropzone from '@/components/file-dropzone'
import { extractAnswersFromImage } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_BYTES = 20 * 1024 * 1024 // keep in sync with worker MAX_IMAGE_BYTES
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png'])

// State machine values
//   idle       — no file picked
//   previewing — file picked locally, ready to send
//   uploading  — XHR uploading bytes (progress 0..1 known)
//   extracting — upload done, waiting for model response (indeterminate)
//   done       — extraction succeeded; preview + warnings shown, can replace
//   error      — last attempt failed; retry / replace allowed

// Model selection is a teacher-side concern; the worker resolves the model
// from its allowlist (currently the default). Students are not given a choice.

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1)
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Image upload + extraction panel.
 *
 * Props:
 *   submissionId — number — id of the in-progress submission
 *   onExtracted  — ({ extracted, warnings, model_used }) => void
 *                  Called when the model returns a valid response. Caller
 *                  merges the answers into form state.
 *   disabled     — boolean — disable picker + buttons (e.g., already submitted)
 */
export default function AnswerImageUpload({ submissionId, onExtracted, disabled = false }) {
  const { token } = useAuth()
  const previewUrlRef = useRef(null)
  const abortRef = useRef(null)

  const [phase, setPhase] = useState('idle') // idle|previewing|uploading|extracting|done|error
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [warnings, setWarnings] = useState([])
  const [showWarnings, setShowWarnings] = useState(false)

  // Revoke preview URL on unmount / replace
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const clearFile = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setFile(null)
    setPreviewUrl(null)
    setProgress(0)
    setErrorMessage('')
    setWarnings([])
    setPhase('idle')
  }, [])

  const handleFilePicked = useCallback((picked) => {
    if (!picked) return

    // Client-side validation — saves a network round trip on obvious errors.
    if (!ALLOWED_TYPES.has(picked.type)) {
      setErrorMessage('Only JPEG and PNG images are accepted.')
      setPhase('error')
      return
    }
    if (picked.size > MAX_BYTES) {
      setErrorMessage(`Image is ${formatMb(picked.size)} MB. Maximum is 20 MB.`)
      setPhase('error')
      return
    }

    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(picked)
    previewUrlRef.current = url

    setFile(picked)
    setPreviewUrl(url)
    setProgress(0)
    setErrorMessage('')
    setWarnings([])
    setPhase('previewing')
  }, [])

  const startExtraction = useCallback(async () => {
    if (!file) return
    setPhase('uploading')
    setProgress(0)
    setErrorMessage('')
    setWarnings([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      // Model is intentionally not passed — the worker resolves it from its
      // allowlist (teacher-configured in a future PR). Students cannot pick.
      const data = await extractAnswersFromImage(token, submissionId, file, undefined, {
        onProgress: (frac) => {
          setProgress(frac)
          if (frac >= 1) setPhase('extracting')
        },
        signal: controller.signal,
      })

      setProgress(1)
      setWarnings(data.warnings || [])
      setShowWarnings(false)
      setPhase('done')
      onExtracted?.({
        extracted: data.extracted || [],
        warnings: data.warnings || [],
        model_used: data.model_used,
      })
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Cancelled mid-upload by the user — return to previewing so they can retry.
        setPhase('previewing')
        setProgress(0)
        return
      }
      setErrorMessage(err?.message || 'Extraction failed')
      setPhase('error')
    } finally {
      abortRef.current = null
    }
  }, [file, onExtracted, submissionId, token])

  const handleCancel = () => {
    abortRef.current?.abort()
  }

  const isBusy = phase === 'uploading' || phase === 'extracting'

  return (
    <div className="space-y-3">
      {/* Top row: replace action (only when a file is selected) */}
      {file && !isBusy && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFile}
            disabled={disabled}
            aria-label="Replace image"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Replace image
          </Button>
        </div>
      )}

      {/* Inline error before any file is accepted (e.g., wrong type / oversize) */}
      {!file && phase === 'error' && (
        <div className="flex items-start gap-2 rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Dropzone (shared primitive) — only when no file is selected. Once
          picked, AnswerImageUpload renders its own preview + status panel. */}
      {!file ? (
        <FileDropzone
          file={null}
          onChange={handleFilePicked}
          accept="image/jpeg,image/jpg,image/png"
          icon={ImagePlus}
          title="Drop a photo here or click to pick"
          hint="JPEG or PNG, up to 20 MB · use your camera on mobile"
          capture="environment"
          inputAriaLabel="Pick or capture answer sheet image"
          size="lg"
          disabled={disabled || isBusy}
        />
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row">
          {/* Preview */}
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Selected answer sheet"
              className="h-32 w-full shrink-0 rounded-md border object-contain sm:h-40 sm:w-40"
            />
          )}

          {/* Status / actions */}
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
            <div className="space-y-2">
              <div className="truncate text-sm font-medium" title={file.name}>{file.name}</div>
              <div className="text-xs text-muted-foreground">{formatSize(file.size)}</div>

              {phase === 'uploading' && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    Uploading… {Math.round(progress * 100)}%
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {phase === 'extracting' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Extracting answers… (usually 5–15 s)
                </div>
              )}

              {phase === 'done' && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="text-success">
                    ✓ Extracted. Review and edit before submitting.
                  </div>
                  {warnings.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowWarnings((v) => !v)}
                      className="flex items-center gap-1 text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      {warnings.length} warning{warnings.length > 1 ? 's' : ''}
                      {showWarnings ? ' (hide)' : ' (show)'}
                    </button>
                  )}
                  {showWarnings && warnings.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4 text-amber-700 dark:text-amber-400">
                      {warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {phase === 'error' && (
                <div className="flex items-start gap-2 rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {phase === 'previewing' && (
                <>
                  <Button type="button" size="sm" onClick={startExtraction} disabled={disabled}>
                    <Camera className="mr-1.5 h-4 w-4" />
                    Extract answers
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    disabled={disabled}
                  >
                    Remove
                  </Button>
                </>
              )}
              {phase === 'uploading' && (
                <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
                  <X className="mr-1 h-4 w-4" />
                  Cancel upload
                </Button>
              )}
              {phase === 'extracting' && (
                <span className="text-xs italic text-muted-foreground">Working…</span>
              )}
              {phase === 'done' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startExtraction}
                  disabled={disabled}
                  title="Re-run extraction on the same image"
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Re-extract
                </Button>
              )}
              {phase === 'error' && (
                <>
                  <Button type="button" size="sm" onClick={startExtraction} disabled={disabled}>
                    Retry
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    disabled={disabled}
                  >
                    Pick a different image
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
