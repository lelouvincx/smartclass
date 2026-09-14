import React from 'react'
import { useTranslation } from 'react-i18next'
import { accessSummaryForLecture, audienceChangeForLecture, formatProgrammeSet, placementPath } from './curriculum-utils'

function AccessSummary({ summary }) {
  const { t } = useTranslation()
  if (summary.tier) {
    return t(summary.key, { tier: t(`curriculumManagement.tiers.${summary.tier}`), programmes: formatProgrammeSet(summary.programmes, t) })
  }
  return t(summary.key)
}

function PathList({ label, placements }) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {placements.length > 0 ? (
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {placements.map((placement) => (
            <li key={placement.placement_id ?? `${placement.programme}-${placement.lesson_id}`}>{placementPath(placement, t)}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">{t('curriculumManagement.impact.unplaced')}</p>
      )}
    </div>
  )
}

function ImpactBlock({ lecture, previousPlacements, nextPlacements, affectedPlacements, change, tierChange, visibilityChange }) {
  const { t } = useTranslation()
  const computedChange = change ?? (lecture ? audienceChangeForLecture(lecture, nextPlacements ?? lecture.placements) : { gained: [], lost: [] })
  const placements = affectedPlacements ?? lecture?.placements ?? []
  const affectedIds = new Set(placements.map((placement) => placement.placement_id))
  const sourcePlacements = previousPlacements?.filter((placement) => affectedIds.has(placement.placement_id)) ?? []
  const beforeAccess = accessSummaryForLecture(lecture, lecture?.placements)
  const nextLecture = lecture ? {
    ...lecture,
    minimum_access_tier: tierChange?.to ?? lecture.minimum_access_tier,
    is_visible: visibilityChange ? visibilityChange.to : lecture.is_visible,
  } : lecture
  const afterAccess = accessSummaryForLecture(nextLecture, nextPlacements ?? lecture?.placements)

  return (
    <div className="space-y-3">
      {lecture?.title && <p className="font-medium">{lecture.title}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('curriculumManagement.impact.gained')}</p>
          <p>{formatProgrammeSet(computedChange.gained, t)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t('curriculumManagement.impact.lost')}</p>
          <p>{formatProgrammeSet(computedChange.lost, t)}</p>
        </div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{t('curriculumManagement.impact.accessBefore')}</dt>
          <dd><AccessSummary summary={beforeAccess} /></dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">{t('curriculumManagement.impact.accessAfter')}</dt>
          <dd><AccessSummary summary={afterAccess} /></dd>
        </div>
        {tierChange && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t('curriculumManagement.video.tier')}</dt>
            <dd>{t(`curriculumManagement.tiers.${tierChange.from}`)} → {t(`curriculumManagement.tiers.${tierChange.to}`)}</dd>
          </div>
        )}
        {visibilityChange && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{t('curriculumManagement.video.visibility')}</dt>
            <dd>{t(visibilityChange.from ? 'curriculumManagement.visible' : 'curriculumManagement.hidden')} → {t(visibilityChange.to ? 'curriculumManagement.visible' : 'curriculumManagement.hidden')}</dd>
          </div>
        )}
      </dl>
      {previousPlacements ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <PathList label={t('curriculumManagement.impact.sourcePaths')} placements={sourcePlacements} />
          <PathList label={t('curriculumManagement.impact.destinationPaths')} placements={placements} />
        </div>
      ) : <PathList label={t('curriculumManagement.impact.paths')} placements={placements} />}
    </div>
  )
}

export function AudienceImpact({ title, description, lecture, nextPlacements, affectedPlacements, tierChange, visibilityChange, impacts }) {
  const { t } = useTranslation()
  const visibleImpacts = impacts?.length ? impacts : null

  return (
    <div className="space-y-3 rounded-[var(--sc-component-control-shape)] border border-border bg-muted/40 p-3 text-sm">
      <div>
        <p className="font-medium">{title ?? t('curriculumManagement.impact.title')}</p>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      {visibleImpacts ? (
        <ul className="space-y-3" aria-label={t('curriculumManagement.impact.affectedVideos')}>
          {visibleImpacts.map((impact) => (
            <li key={impact.lecture.id} className="rounded-[var(--sc-component-control-shape)] border bg-background p-3">
              <ImpactBlock {...impact} />
            </li>
          ))}
        </ul>
      ) : <ImpactBlock lecture={lecture} nextPlacements={nextPlacements} affectedPlacements={affectedPlacements} tierChange={tierChange} visibilityChange={visibilityChange} />}
    </div>
  )
}
