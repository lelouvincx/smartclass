import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOff } from 'lucide-react'
import { getQuestionAssetBlob } from '@/lib/api'
import { Button } from '@/components/ui/button'

function sortSegments(left, right) {
  return left.segment_index - right.segment_index
}

export function QuestionImagePanel({ token, assets = [], currentQId, adjacentQIds = [] }) {
  const { t } = useTranslation()
  const [assetStates, setAssetStates] = useState({})
  const objectUrlsRef = useRef(new Map())
  const inFlightRef = useRef(new Set())
  const failedAssetIdsRef = useRef(new Set())
  const mountedRef = useRef(true)

  const currentAssets = useMemo(
    () => assets.filter((asset) => asset.q_id === currentQId).sort(sortSegments),
    [assets, currentQId],
  )

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
              <img
                src={state.url}
                alt={asset.accessible_text || ''}
                className="h-auto w-full"
                onError={() => handleImageError(asset)}
              />
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
    </div>
  )
}
