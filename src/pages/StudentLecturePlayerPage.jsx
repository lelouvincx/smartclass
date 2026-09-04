import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, ExternalLink, VideoOff } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { listLectures } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { getLectureIdFromSlug, getLecturePath, getYouTubeVideoId } from '@/lib/lectures'
import YouTubeLecturePlayer from '@/components/youtube-lecture-player'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'

export default function StudentLecturePlayerPage() {
  const { t } = useTranslation()
  const { token, user } = useAuth()
  const { lectureSlug } = useParams()
  const headingRef = useRef(null)
  const [lectures, setLectures] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadLecture() {
      try {
        const response = await listLectures(token)
        if (active) setLectures(response.data || [])
      } catch (loadError) {
        if (active) setError(loadError.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    loadLecture()
    return () => { active = false }
  }, [token])

  const lectureId = getLectureIdFromSlug(lectureSlug)
  const lectureIndex = lectures.findIndex((item) => item.id === lectureId)
  const lecture = lectures[lectureIndex]
  const previous = lectureIndex > 0 ? lectures[lectureIndex - 1] : null
  const next = lectureIndex >= 0 && lectureIndex < lectures.length - 1 ? lectures[lectureIndex + 1] : null
  const videoId = lecture ? getYouTubeVideoId(lecture.youtube_url) : null

  useEffect(() => {
    if (!lecture) return
    document.title = `${lecture.title} | SmartClass`
    headingRef.current?.focus()
    return () => { document.title = 'SmartClass' }
  }, [lecture])

  if (isLoading) {
    return <Card><p className="p-5 text-sm text-muted-foreground">{t('student.lectures.loadingLecture')}</p></Card>
  }

  if (error) {
    return (
      <Card>
        <div className="space-y-4 p-5">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button asChild variant="outline"><Link to="/student/lectures">{t('student.lectures.back')}</Link></Button>
        </div>
      </Card>
    )
  }

  if (!lecture) {
    return (
      <Card>
        <EmptyState
          icon={VideoOff}
          title={t('student.lectures.notFound')}
          description={t('student.lectures.notFoundDescription')}
          action={<Button asChild><Link to="/student/lectures">{t('student.lectures.back')}</Link></Button>}
        />
      </Card>
    )
  }

  return (
    <article className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" className="-ms-2">
        <Link to="/student/lectures"><ArrowLeft aria-hidden="true" />{t('student.lectures.back')}</Link>
      </Button>

      <header className="space-y-2">
        <p className="text-sm font-medium text-primary">{lecture.section_name}</p>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-[length:var(--sc-type-headline-size)] leading-[var(--sc-type-headline-line-height)] font-[var(--sc-type-headline-weight)] tracking-[-0.03em] text-balance outline-none"
        >
          {lecture.title}
        </h1>
      </header>

      <div className="overflow-hidden rounded-[var(--sc-component-card-shape)] border border-border bg-black shadow-[var(--shadow-card)]">
        {videoId ? (
          <YouTubeLecturePlayer
            key={`${user.id}:${lecture.id}:${videoId}`}
            accountId={user.id}
            lectureId={lecture.id}
            videoId={videoId}
            title={t('student.lectures.videoTitle', { title: lecture.title })}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-white">
            {t('student.lectures.embedUnavailable')}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button asChild variant="outline">
          <a href={lecture.youtube_url} target="_blank" rel="noreferrer">
            {t('student.lectures.openYoutube')}<ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>

      <nav aria-label={t('student.lectures.sequenceNavigation')} className="grid gap-3 border-t pt-6 sm:grid-cols-2">
        {previous ? (
          <Link
            to={getLecturePath(previous)}
            aria-label={t('student.lectures.previousNamed', { title: previous.title })}
            className="group flex min-h-[72px] items-center gap-3 rounded-[var(--sc-component-card-shape)] border bg-card p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0"><span className="block text-xs text-muted-foreground">{t('student.lectures.previous')}</span><span className="block font-medium">{previous.title}</span></span>
          </Link>
        ) : <span />}
        {next && (
          <Link
            to={getLecturePath(next)}
            aria-label={t('student.lectures.nextNamed', { title: next.title })}
            className="group flex min-h-[72px] items-center justify-end gap-3 rounded-[var(--sc-component-card-shape)] border border-primary/15 bg-sc-primary-container p-4 text-end text-sc-on-primary-container shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="min-w-0"><span className="block text-xs opacity-75">{t('student.lectures.next')}</span><span className="block font-semibold">{next.title}</span></span>
            <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </article>
  )
}
