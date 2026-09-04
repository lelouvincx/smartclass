import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOff, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { getQuestionAssetBlob } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const MIN_VIEWER_ZOOM = 1
const MAX_VIEWER_ZOOM = 4
const VIEWER_ZOOM_STEP = 0.5

function clampViewerZoom(zoom) {
  return Math.min(MAX_VIEWER_ZOOM, Math.max(MIN_VIEWER_ZOOM, zoom))
}

function initialViewerZoom() {
  if (typeof window === 'undefined') return MIN_VIEWER_ZOOM
  return window.innerWidth < 768 && window.innerHeight > window.innerWidth ? 3 : MIN_VIEWER_ZOOM
}

function touchDistance(touches) {
  const horizontal = touches[0].clientX - touches[1].clientX
  const vertical = touches[0].clientY - touches[1].clientY
  return Math.hypot(horizontal, vertical)
}

function sortSegments(left, right) {
  return left.segment_index - right.segment_index
}

export function QuestionImagePanel({ token, assets = [], currentQId, adjacentQIds = [] }) {
  const { t } = useTranslation()
  const [assetStates, setAssetStates] = useState({})
  const [viewerAssetId, setViewerAssetId] = useState(null)
  const [viewerZoom, setViewerZoom] = useState(MIN_VIEWER_ZOOM)
  const objectUrlsRef = useRef(new Map())
  const inFlightRef = useRef(new Set())
  const failedAssetIdsRef = useRef(new Set())
  const mountedRef = useRef(true)
  const pinchRef = useRef(null)

  const currentAssets = useMemo(
    () => assets.filter((asset) => asset.q_id === currentQId).sort(sortSegments),
    [assets, currentQId],
  )
  const viewerAsset = currentAssets.find((asset) => asset.id === viewerAssetId)
  const viewerState = viewerAsset ? assetStates[viewerAsset.id] : null

  const loadAsset = useCallback(async (asset, { force = false } = {}) => {
    if (!force && (
      objectUrlsRef.current.has(asset.id)
      || inFlightRef.current.has(asset.id)
      || failedAssetIdsRef.current.has(asset.id)
    )) {
      return
    }

    if (force) failedAssetIdsRef.current.delete(asset.id)

    const previousUrl = objectUrlsRef.current.get(asset.id)
    if (previousUrl) {
      URL.revokeObjectURL(previousUrl)
      objectUrlsRef.current.delete(asset.id)
    }

    inFlightRef.current.add(asset.id)
    setAssetStates((current) => ({
      ...current,
      [asset.id]: { status: 'loading', url: null },
    }))

    try {
      const blob = await getQuestionAssetBlob(token, asset.file_url)
      const url = URL.createObjectURL(blob)
      if (!mountedRef.current) {
        URL.revokeObjectURL(url)
        return
      }
      objectUrlsRef.current.set(asset.id, url)
      failedAssetIdsRef.current.delete(asset.id)
      setAssetStates((current) => ({
        ...current,
        [asset.id]: { status: 'loaded', url },
      }))
    } catch {
      if (mountedRef.current) {
        failedAssetIdsRef.current.add(asset.id)
        setAssetStates((current) => ({
          ...current,
          [asset.id]: { status: 'failed', url: null },
        }))
      }
    } finally {
      inFlightRef.current.delete(asset.id)
    }
  }, [token])

  const handleImageError = useCallback((asset) => {
    const url = objectUrlsRef.current.get(asset.id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrlsRef.current.delete(asset.id)
    }
    failedAssetIdsRef.current.add(asset.id)
    setAssetStates((current) => ({
      ...current,
      [asset.id]: { status: 'failed', url: null },
    }))
  }, [])

  function openViewer(assetId) {
    setViewerAssetId(assetId)
    setViewerZoom(initialViewerZoom())
  }

  function handleViewerOpenChange(open) {
    if (open) return
    setViewerAssetId(null)
    setViewerZoom(MIN_VIEWER_ZOOM)
    pinchRef.current = null
  }

  function handleViewerTouchStart(event) {
    if (event.touches.length !== 2) return
    pinchRef.current = {
      distance: touchDistance(event.touches),
      zoom: viewerZoom,
    }
  }

  function handleViewerTouchMove(event) {
    if (event.touches.length !== 2 || !pinchRef.current) return
    event.preventDefault()
    const scale = touchDistance(event.touches) / pinchRef.current.distance
    setViewerZoom(clampViewerZoom(pinchRef.current.zoom * scale))
  }

  function handleViewerTouchEnd(event) {
    if (event.touches.length < 2) pinchRef.current = null
  }

  useEffect(() => {
    const questionIds = new Set([currentQId, ...adjacentQIds])
    for (const asset of assets) {
      if (questionIds.has(asset.q_id)) loadAsset(asset)
    }
  }, [adjacentQIds, assets, currentQId, loadAsset])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const url of objectUrlsRef.current.values()) URL.revokeObjectURL(url)
      objectUrlsRef.current.clear()
    }
  }, [])

  if (currentAssets.length === 0) {
    return (
      <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/35 p-6 text-center">
        <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t('student.questionView.unavailable')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3" aria-label={t('student.questionView.label', { id: currentQId })}>
      {currentAssets.map((asset, index) => {
        const state = assetStates[asset.id] || { status: 'loading', url: null }
        return (
          <figure key={asset.id} className="overflow-hidden rounded-lg border bg-white">
            {currentAssets.length > 1 && (
              <figcaption className="border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                {t('student.questionView.segment', { current: index + 1, total: currentAssets.length })}
              </figcaption>
            )}

            {state.status === 'loaded' ? (
              <button
                type="button"
                className="group block w-full cursor-zoom-in text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={currentAssets.length > 1
                  ? t('student.questionView.openSegmentLarge', {
                    id: currentQId,
                    current: index + 1,
                    total: currentAssets.length,
                  })
                  : t('student.questionView.openLarge', { id: currentQId })}
                onClick={() => openViewer(asset.id)}
              >
                <img
                  src={state.url}
                  alt={asset.accessible_text || ''}
                  className="h-auto w-full"
                  onError={() => handleImageError(asset)}
                />
                <span
                  aria-hidden="true"
                  className="flex min-h-12 items-center justify-center gap-2 border-t bg-muted/30 px-3 text-sm font-medium text-foreground transition-colors group-hover:bg-muted/60"
                >
                  <Maximize2 className="h-4 w-4" />
                  {t('student.questionView.openLargeShort')}
                </span>
              </button>
            ) : state.status === 'failed' ? (
              <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center">
                <ImageOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">{t('student.questionView.failed')}</p>
                <Button type="button" variant="outline" onClick={() => loadAsset(asset, { force: true })}>
                  {t('student.questionView.retry')}
                </Button>
              </div>
            ) : (
              <div role="status" className="flex min-h-64 items-center justify-center bg-muted/35 p-6">
                <p className="text-sm text-muted-foreground">{t('student.questionView.loading')}</p>
              </div>
            )}
          </figure>
        )
      })}

      {viewerAsset && viewerState?.url && (
        <Dialog open onOpenChange={handleViewerOpenChange}>
          <DialogContent
            showCloseButton={false}
            className="inset-0 top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none bg-[var(--sc-ref-slate-950)] p-0 text-[var(--sc-ref-white)] ring-0 sm:max-w-none"
            onEscapeKeyDown={() => handleViewerOpenChange(false)}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/10 hover:text-white"
              aria-label={t('common.close')}
              onClick={() => handleViewerOpenChange(false)}
            >
              <X aria-hidden="true" />
            </Button>
            <DialogHeader className="shrink-0 gap-1 border-b border-white/15 px-4 py-3 pr-16 text-left">
              <DialogTitle className="text-base font-semibold text-white">
                {t('student.questionView.viewerTitle', { id: currentQId })}
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--sc-ref-slate-300)]">
                {t('student.questionView.viewerDescription')}
              </DialogDescription>
            </DialogHeader>

            <div
              data-testid="question-image-viewer-canvas"
              className="min-h-0 flex-1 overflow-auto overscroll-contain [touch-action:pan-x_pan-y]"
              onTouchStart={handleViewerTouchStart}
              onTouchMove={handleViewerTouchMove}
              onTouchEnd={handleViewerTouchEnd}
              onTouchCancel={handleViewerTouchEnd}
            >
              <div className="flex min-h-full min-w-full">
                <img
                  data-testid="question-image-viewer-image"
                  src={viewerState.url}
                  alt={viewerAsset.accessible_text || ''}
                  className="m-auto block h-auto max-w-none shrink-0 bg-white"
                  style={{ width: `${viewerZoom * 100}%` }}
                  onError={() => handleImageError(viewerAsset)}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/15 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                aria-label={t('student.questionView.zoomOut')}
                disabled={viewerZoom <= MIN_VIEWER_ZOOM}
                onClick={() => setViewerZoom((zoom) => clampViewerZoom(zoom - VIEWER_ZOOM_STEP))}
              >
                <ZoomOut aria-hidden="true" />
              </Button>
              <output
                className="min-w-16 text-center text-sm font-medium tabular-nums"
                aria-label={t('student.questionView.zoomLevel', { percent: Math.round(viewerZoom * 100) })}
              >
                {Math.round(viewerZoom * 100)}%
              </output>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                aria-label={t('student.questionView.zoomIn')}
                disabled={viewerZoom >= MAX_VIEWER_ZOOM}
                onClick={() => setViewerZoom((zoom) => clampViewerZoom(zoom + VIEWER_ZOOM_STEP))}
              >
                <ZoomIn aria-hidden="true" />
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
