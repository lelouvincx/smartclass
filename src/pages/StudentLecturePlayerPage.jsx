import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, History, VideoOff } from '@/components/material-symbol'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getLecture } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import {
  getLectureIdFromSlug,
  getLecturePath,
  getYouTubeEmbedUrl,
  getYouTubeVideoId,
} from '@/lib/lectures'
import YouTubeLecturePlayer from '@/components/youtube-lecture-player'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/design-system/empty-state'

export default function StudentLecturePlayerPage({ audience = 'student' }) {
  const { t } = useTranslation()
  const { token, user, workspace } = useAuth()
  const { lectureSlug } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const tracksPlayback = audience === 'student'
  const headingRef = useRef(null)
  const requestRef = useRef(0)
  const [retryCount, setRetryCount] = useState(0)
  const [context, setContext] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  const lectureListPath = audience === 'guest' ? '/lectures' : `/${audience}/lectures`
  const placementId = searchParams.get('placement')
  const lectureId = getLectureIdFromSlug(lectureSlug)
  const contextResolvedPlacementId = context?.data?.placement?.id == null ? null : String(context.data.placement.id)
  const contextMatchesRoute = context?.lectureId === lectureId && context?.token === token && (
    context.placementId === placementId || contextResolvedPlacementId === placementId
  )

  useEffect(() => {
    if (contextMatchesRoute) {
      setIsLoading(false)
      return undefined
    }

    const requestId = requestRef.current + 1
    requestRef.current = requestId

    setContext(null)
    setIsLoading(true)
    setError('')
    setNotFound(false)

    if (!lectureId) {
      setIsLoading(false)
      setNotFound(true)
      return undefined
    }

    async function loadLecture() {
      try {
        const response = await getLecture(token, lectureId, placementId)
        if (requestRef.current !== requestId) return
        setContext({ data: response.data, lectureId, placementId, token })
      } catch (loadError) {
        if (requestRef.current !== requestId) return
        if (loadError.status === 404 || loadError.code === 'NOT_FOUND') {
          setNotFound(true)
        } else {
          setError(loadError.message)
        }
      } finally {
        if (requestRef.current === requestId) setIsLoading(false)
      }
    }
    loadLecture()
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1
    }
  }, [contextMatchesRoute, lectureId, placementId, retryCount, token])

  const currentContext = contextMatchesRoute ? context.data : null
  const lecture = currentContext?.lecture || null
  const previous = currentContext?.previous || null
  const next = currentContext?.next || null
  const breadcrumb = currentContext?.breadcrumb || null
  const placement = currentContext?.placement || null
  const videoId = lecture ? getYouTubeVideoId(lecture.youtube_url) : null
  const routeMatchesLecture = lecture?.id === lectureId
  const canonicalPath = routeMatchesLecture && getLecturePath(lecture, audience, placement?.id)
  const backPath = getLectureListPath(lectureListPath, breadcrumb)
  const breadcrumbLabel = formatBreadcrumb(breadcrumb)

  useEffect(() => {
    if (!lecture || !canonicalPath) return
    if (`${location.pathname}${location.search}` === canonicalPath) return
    navigate(canonicalPath, { replace: true })
  }, [canonicalPath, lecture, location.pathname, location.search, navigate])

  useEffect(() => {
    if (!lecture) return
    document.title = `${lecture.title} | SmartClass`
    headingRef.current?.focus()
    return () => { document.title = 'SmartClass' }
  }, [lecture])

  if (isLoading || (context && !currentContext)) {
    return <Card><p className="p-5 text-sm text-muted-foreground">{t('student.lectures.loadingLecture')}</p></Card>
  }

  if (lecture && !routeMatchesLecture) {
    return <Card><p className="p-5 text-sm text-muted-foreground">{t('student.lectures.loadingLecture')}</p></Card>
  }

  if (error) {
    return (
      <Card>
        <div className="space-y-4 p-5">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => setRetryCount((value) => value + 1)}>{t('student.lectures.retry')}</Button>
            <Button asChild variant="outline"><Link to={lectureListPath}>{t('student.lectures.back')}</Link></Button>
          </div>
        </div>
      </Card>
    )
  }

  if (notFound || !lecture) {
    return (
      <Card>
        <EmptyState
          icon={VideoOff}
          title={t('student.lectures.notFound')}
          description={t('student.lectures.notFoundDescription')}
          action={<Button asChild><Link to={lectureListPath}>{t('student.lectures.back')}</Link></Button>}
        />
      </Card>
    )
  }

  return (
    <article className="mx-auto max-w-5xl space-y-7">
      <header className="space-y-5 border-b border-border pb-6">
        <Button asChild variant="ghost" className="-ms-2">
          <Link to={backPath}><ArrowLeft aria-hidden="true" />{t('student.lectures.back')}</Link>
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
          {breadcrumbLabel || lecture.section_name || t('student.lectures.unplaced')}
        </p>
      </header>

      <section
        aria-label={t('student.lectures.videoTitle', { title: lecture.title })}
        className="overflow-hidden rounded-[var(--sc-component-card-shape)] border border-border bg-card shadow-[var(--shadow-card)]"
      >
        <div className="bg-black">
          {videoId ? (
            !tracksPlayback ? (
              <iframe
                className="aspect-video w-full"
                src={getYouTubeEmbedUrl(lecture.youtube_url)}
                title={t('student.lectures.videoTitle', { title: lecture.title })}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <YouTubeLecturePlayer
                key={`${user.id}:${workspace?.id}:${lecture.id}:${videoId}`}
                accountId={user.id}
                workspaceId={workspace?.id}
                lectureId={lecture.id}
                videoId={videoId}
                title={t('student.lectures.videoTitle', { title: lecture.title })}
              />
            )
          ) : (
            <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-white">
              {t('student.lectures.embedUnavailable')}
            </div>
          )}
        </div>
        <div className={`flex flex-col gap-3 border-t border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:px-5 ${tracksPlayback ? 'sm:justify-between' : 'sm:justify-end'}`}>
          {tracksPlayback && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {t('student.lectures.playbackResume')}
            </p>
          )}
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
            to={getLecturePath({ id: previous.lecture_id, title: previous.title }, audience, previous.placement_id)}
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
            to={getLecturePath({ id: next.lecture_id, title: next.title }, audience, next.placement_id)}
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

function getLectureListPath(basePath, breadcrumb) {
  if (!breadcrumb) return basePath
  const params = new URLSearchParams()
  if (breadcrumb.programme != null) params.set('programme', String(breadcrumb.programme))
  if (breadcrumb.lesson_id != null) params.set('lesson', String(breadcrumb.lesson_id))
  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

function formatBreadcrumb(breadcrumb) {
  if (!breadcrumb) return ''
  return [breadcrumb.topic_title, breadcrumb.lesson_title].filter(Boolean).join(' · ')
}
