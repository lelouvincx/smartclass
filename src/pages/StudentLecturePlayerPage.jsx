import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, History, VideoOff } from 'lucide-react'
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
    <article className="mx-auto max-w-5xl space-y-7">
      <header className="space-y-5 border-b border-border pb-6">
        <Button asChild variant="ghost" className="-ms-2">
          <Link to="/student/lectures"><ArrowLeft aria-hidden="true" />{t('student.lectures.back')}</Link>
        </Button>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="max-w-[28ch] text-[length:var(--sc-type-headline-size)] leading-[var(--sc-type-headline-line-height)] font-[var(--sc-type-headline-weight)] tracking-[-0.03em] text-balance outline-none"
        >
          {lecture.title}
        </h1>
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <BookOpen className="size-4 text-primary" aria-hidden="true" />
          {lecture.section_name}
        </p>
      </header>

      <section
        aria-label={t('student.lectures.videoTitle', { title: lecture.title })}
        className="overflow-hidden rounded-[var(--sc-component-card-shape)] border border-border bg-card shadow-[var(--shadow-card)]"
      >
        <div className="bg-black">
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
        <div className="flex flex-col gap-3 border-t border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {t('student.lectures.playbackResume')}
          </p>
          <Button asChild variant="ghost" className="self-start sm:self-auto">
            <a href={lecture.youtube_url} target="_blank" rel="noreferrer">
              {t('student.lectures.openYoutube')}<ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </div>
      </section>

      <nav aria-label={t('student.lectures.sequenceNavigation')} className="grid gap-3 sm:grid-cols-2">
        {previous ? (
          <Link
            to={getLecturePath(previous)}
            aria-label={t('student.lectures.previousNamed', { title: previous.title })}
            className="group flex min-h-24 items-center gap-4 rounded-[var(--sc-component-card-shape)] border bg-card p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-muted text-primary transition-colors group-hover:bg-sc-primary-container">
              <ArrowLeft className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 space-y-1"><span className="block text-xs font-medium text-muted-foreground">{t('student.lectures.previous')}</span><span className="block font-semibold leading-snug text-foreground">{previous.title}</span></span>
          </Link>
        ) : <span />}
        {next && (
          <Link
            to={getLecturePath(next)}
            aria-label={t('student.lectures.nextNamed', { title: next.title })}
            className="group flex min-h-24 items-center justify-end gap-4 rounded-[var(--sc-component-card-shape)] border border-primary/15 bg-sc-primary-container p-4 text-end text-sc-on-primary-container shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-primary/35 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="min-w-0 space-y-1"><span className="block text-xs font-medium opacity-75">{t('student.lectures.next')}</span><span className="block font-semibold leading-snug">{next.title}</span></span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--sc-component-control-shape)] bg-primary text-primary-foreground">
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </span>
          </Link>
        )}
      </nav>
    </article>
  )
}
