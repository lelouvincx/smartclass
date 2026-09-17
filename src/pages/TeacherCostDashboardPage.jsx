import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/design-system/page-header'
import { EmptyState } from '@/design-system/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { AlertTriangle, ClipboardList, RefreshCw } from '@/components/material-symbol'
import { getGuestCostInventory } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { estimateGuestDelivery } from '@/lib/guest-cost-estimator'
import { GuestCostVolumeChart } from '@/components/guest-cost-volume-chart'

const SCENARIO_FIELDS = [
  'exerciseListViews',
  'exerciseLandingViews',
  'completeExerciseRuns',
  'sourcePdfDownloads',
]

const DEFAULT_SCENARIO = {
  exerciseListViews: 100,
  exerciseLandingViews: 60,
  completeExerciseRuns: 25,
  sourcePdfDownloads: 10,
}

function formatNumber(value, language) {
  return new Intl.NumberFormat(language).format(Number(value ?? 0))
}

function formatBytes(value, language, unknownLabel = 'Unknown') {
  if (value === null || value === undefined) return unknownLabel
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: 'byte',
    unitDisplay: 'narrow',
    notation: Number(value) >= 1_000_000 ? 'compact' : 'standard',
  }).format(Number(value))
}

function MetricCard({ label, value, description }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  )
}

function buildVolumeChartData(estimate, t) {
  return [
    { metric: t('teacher.costs.chart.dynamicRequestsLabel'), units: estimate.dynamicRequests },
    { metric: t('teacher.costs.chart.imageReadsLabel'), units: estimate.questionAssetReads },
    { metric: t('teacher.costs.chart.pdfReadsLabel'), units: estimate.sourcePdfReads },
  ]
}

function costNoteKey(note) {
  return `teacher.costs.notes.${note}`
}

export default function TeacherCostDashboardPage() {
  const { t, i18n } = useTranslation()
  const { token, isPlatformAdmin: isWorkspaceAdmin } = useAuth()
  const [inventory, setInventory] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO)

  async function loadInventory() {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getGuestCostInventory(token)
      setInventory(response.data)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isWorkspaceAdmin) loadInventory()
    else setIsLoading(false)
  }, [isWorkspaceAdmin, token])

  const estimate = useMemo(() => estimateGuestDelivery(inventory, scenario), [inventory, scenario])
  const hasGuestInventory = Boolean(
    inventory && (
      inventory.guest_exercises.length > 0
      || inventory.guest_lectures.public_placed_count > 0
    ),
  )

  function updateScenario(field, value) {
    setScenario(current => ({ ...current, [field]: value }))
  }

  const volumeChartData = useMemo(() => buildVolumeChartData(estimate, t), [estimate, t])
  const formatChartTick = value => formatNumber(value, i18n.language)

  if (!isWorkspaceAdmin) {
    return (
      <div className="max-w-4xl space-y-6">
        <PageHeader title={t('teacher.costs.title')} description={t('teacher.costs.adminOnlyDescription')} />
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('teacher.costs.adminOnly')}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-8">
      <PageHeader
        title={t('teacher.costs.title')}
        description={t('teacher.costs.description')}
        actions={(
          <Button variant="outline" onClick={loadInventory} disabled={isLoading}>
            <RefreshCw className="size-4" />
            {t('teacher.costs.refresh')}
          </Button>
        )}
      />

      {isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Spinner />
            {t('teacher.costs.loading')}
          </CardContent>
        </Card>
      )}

      {error && !isLoading && (
        <Card className="border-destructive/30">
          <CardContent className="space-y-3 py-6">
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={loadInventory}>{t('teacher.costs.retry')}</Button>
          </CardContent>
        </Card>
      )}

      {inventory && !isLoading && !error && !hasGuestInventory && (
        <EmptyState
          icon={ClipboardList}
          title={t('teacher.costs.empty')}
          description={t('teacher.costs.emptyDescription')}
        />
      )}

      {inventory && !isLoading && !error && hasGuestInventory && (
        <>
          <section aria-labelledby="guest-inventory-title" className="space-y-3">
            <h2 id="guest-inventory-title" className="text-base font-semibold">{t('teacher.costs.inventoryTitle')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label={t('teacher.costs.guestExercises')} value={formatNumber(inventory.totals.guest_exercise_count, i18n.language)} />
              <MetricCard label={t('teacher.costs.questionAssets')} value={formatNumber(inventory.totals.question_asset_count, i18n.language)} description={formatBytes(inventory.totals.question_asset_recorded_bytes, i18n.language, t('teacher.costs.unknown'))} />
              <MetricCard label={t('teacher.costs.exercisePdfs')} value={formatNumber(inventory.totals.exercise_pdf_total_count, i18n.language)} description={inventory.totals.exercise_pdf_unknown_count > 0 ? t('teacher.costs.unknownBytes') : formatBytes(inventory.totals.exercise_pdf_recorded_bytes, i18n.language, t('teacher.costs.unknown'))} />
              <MetricCard label={t('teacher.costs.guestLectures')} value={formatNumber(inventory.guest_lectures.public_placed_count, i18n.language)} />
            </div>
          </section>

          <section aria-labelledby="guest-scenario-title" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
            <Card>
              <CardHeader>
                <CardTitle id="guest-scenario-title">{t('teacher.costs.scenarioTitle')}</CardTitle>
                <CardDescription>{t('teacher.costs.scenarioDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {SCENARIO_FIELDS.map(field => (
                  <label key={field} className="grid gap-2 text-sm font-medium">
                    <span>{t(`teacher.costs.scenario.${field}`)}</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={scenario[field]}
                      onChange={event => updateScenario(field, event.target.value)}
                    />
                  </label>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('teacher.costs.estimateTitle')}</CardTitle>
                <CardDescription>{t('teacher.costs.estimateDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <MetricCard label={t('teacher.costs.dynamicRequests')} value={formatNumber(estimate.dynamicRequests, i18n.language)} />
                <MetricCard label={t('teacher.costs.r2Reads')} value={formatNumber(estimate.r2ClassBReads, i18n.language)} description={t('teacher.costs.r2ReadsDescription', { images: formatNumber(estimate.questionAssetReads, i18n.language), pdfs: formatNumber(estimate.sourcePdfReads, i18n.language) })} />
                <MetricCard label={t('teacher.costs.recordedBytes')} value={formatBytes(estimate.recordedBytes, i18n.language, t('teacher.costs.unknown'))} description={estimate.hasUnknownSourcePdfBytes ? t('teacher.costs.unknownBytes') : undefined} />
                <p className="text-xs text-muted-foreground">{t('teacher.costs.averageDisclosure')}</p>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle id="guest-volume-chart-title">{t('teacher.costs.chart.title')}</CardTitle>
              <CardDescription id="guest-volume-chart-description">{t('teacher.costs.chart.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <figure aria-labelledby="guest-volume-chart-title" aria-describedby="guest-volume-chart-description" className="space-y-3">
                <div aria-hidden="true">
                  <GuestCostVolumeChart data={volumeChartData} formatTick={formatChartTick} />
                </div>
                <ul className="sr-only" aria-label={t('teacher.costs.chart.summaryLabel')}>
                  {volumeChartData.map(row => (
                    <li key={row.metric}>{t('teacher.costs.chart.summaryItem', { label: row.metric, value: formatNumber(row.units, i18n.language) })}</li>
                  ))}
                </ul>
              </figure>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('teacher.costs.exerciseBreakdown')}</CardTitle>
              <CardDescription>{t('teacher.costs.exerciseBreakdownDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="hidden overflow-x-auto rounded-lg border sm:block">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <caption className="sr-only">{t('teacher.costs.exerciseBreakdown')}</caption>
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('teacher.costs.exercise')}</th>
                      <th className="px-3 py-2 font-medium">{t('teacher.costs.assets')}</th>
                      <th className="px-3 py-2 font-medium">{t('teacher.costs.assetBytes')}</th>
                      <th className="px-3 py-2 font-medium">{t('teacher.costs.pdfBytes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {inventory.guest_exercises.map(exercise => (
                      <tr key={exercise.id}>
                        <td className="px-3 py-2 font-medium">{exercise.title}</td>
                        <td className="px-3 py-2 tabular-nums">{formatNumber(exercise.question_assets.count, i18n.language)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatBytes(exercise.question_assets.recorded_bytes, i18n.language, t('teacher.costs.unknown'))}</td>
                        <td className="px-3 py-2 tabular-nums">{formatBytes(exercise.exercise_pdf.recorded_bytes, i18n.language, t('teacher.costs.unknown'))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-3 sm:hidden" aria-label={t('teacher.costs.exerciseBreakdown')}>
                {inventory.guest_exercises.map(exercise => (
                  <li key={exercise.id} className="rounded-lg border p-3">
                    <h3 className="font-medium">{exercise.title}</h3>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-muted-foreground">{t('teacher.costs.assets')}</dt>
                      <dd className="text-right tabular-nums">{formatNumber(exercise.question_assets.count, i18n.language)}</dd>
                      <dt className="text-muted-foreground">{t('teacher.costs.assetBytes')}</dt>
                      <dd className="text-right tabular-nums">{formatBytes(exercise.question_assets.recorded_bytes, i18n.language, t('teacher.costs.unknown'))}</dd>
                      <dt className="text-muted-foreground">{t('teacher.costs.pdfBytes')}</dt>
                      <dd className="text-right tabular-nums">{formatBytes(exercise.exercise_pdf.recorded_bytes, i18n.language, t('teacher.costs.unknown'))}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-warning/30 bg-warning-muted/40">
            <CardContent className="flex gap-3 py-4 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4" />
              <div className="space-y-2">
                <p className="font-medium">{t('teacher.costs.limitsTitle')}</p>
                <ul className="list-disc space-y-1 pl-5">
                  {inventory.notes.map(note => <li key={note}>{t(costNoteKey(note), { defaultValue: note })}</li>)}
                  <li>{t('teacher.costs.additionalLimit')}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
