import React, { useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'smartclass-take-pdf-visible'

/**
 * PdfSplitPane — wraps content alongside an inline PDF viewer.
 *
 * Props:
 *   fileUrl {string|null} — URL for the PDF iframe. If null, renders children only.
 *   children {ReactNode}  — the right-pane content (answer form or review).
 *
 * Desktop (lg+): side-by-side grid, PDF on left, children on right.
 * Mobile (<lg):  PDF in a collapsible section above children.
 * Toggle state persisted to localStorage (key: smartclass-take-pdf-visible, default: visible).
 */
export function PdfSplitPane({ fileUrl, children }) {
  const [pdfVisible, setPdfVisible] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === null ? true : stored !== 'false'
    } catch {
      return true
    }
  })

  function togglePdfVisible() {
    const next = !pdfVisible
    setPdfVisible(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore
    }
  }
  const collapsed = !pdfVisible

  // No PDF — render children directly with no layout change
  if (!fileUrl) {
    return <>{children}</>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle button — visible on all screen sizes */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={togglePdfVisible}
          aria-label={collapsed ? 'Show PDF' : 'Hide PDF'}
          aria-expanded={!collapsed}
        >
          <FileText className="mr-1 h-4 w-4" />
          {collapsed ? 'Show PDF' : 'Hide PDF'}
        </Button>
      </div>

      {/* Split layout — PDF gets 3 parts, content gets 2 parts (60/40) */}
      <div
        className={cn(
          'gap-6',
          !collapsed && 'lg:grid lg:grid-cols-[3fr_2fr]',
        )}
      >
        {/* PDF pane */}
        {!collapsed && (
          <div className="mb-4 lg:mb-0">
            <div className="sticky top-20 h-[calc(100vh-7rem)] overflow-hidden rounded-lg border bg-muted">
              <iframe
                src={fileUrl}
                title="Exercise PDF"
                className="h-full w-full"
              />
            </div>
          </div>
        )}

        {/* Content pane */}
        <div>{children}</div>
      </div>
    </div>
  )
}
