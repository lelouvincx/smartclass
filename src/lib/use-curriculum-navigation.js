import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getCurriculumLesson, listCurriculum } from '@/lib/api'
import { gradesForWorkspace, sortGrades } from '@/lib/grades'
import { requireWorkspaceSite } from '@/lib/workspaces'

function normalizeProgramme(value) {
  if (value === 10 || value === '10') return 10
  if (value === 11 || value === '11') return 11
  if (value === 12 || value === '12') return 12
  return value === 'thpt' || value === 'dgnl' ? value : null
}

function parsePositiveId(value) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function conservativeRevision(treeRevision, detailRevision) {
  const revisions = [treeRevision, detailRevision].filter((value) => Number.isSafeInteger(value))
  if (revisions.length === 0) return null
  return Math.min(...revisions)
}

function findTopicForLesson(topics, lessonId) {
  if (!lessonId) return null
  return topics.find((topic) => topic.lessons?.some((lesson) => lesson.id === lessonId)) || null
}

export function useCurriculumNavigation(token, workspace, options = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const effectiveWorkspace = useMemo(() => workspace ?? requireWorkspaceSite(), [workspace])
  const programmes = useMemo(() => gradesForWorkspace(effectiveWorkspace), [effectiveWorkspace])
  const preferredProgrammes = useMemo(() => sortGrades(
    (options.preferredProgrammes || []).map(normalizeProgramme).filter((value) => value !== null),
    programmes,
  ), [options.preferredProgrammes, programmes])
  const defaultProgramme = preferredProgrammes[0] ?? programmes[0]
  const urlProgramme = normalizeProgramme(searchParams.get('programme'))
  const programme = programmes.includes(urlProgramme) ? urlProgramme : defaultProgramme
  const topicId = parsePositiveId(searchParams.get('topic'))
  const lessonId = parsePositiveId(searchParams.get('lesson'))
  const treeKey = JSON.stringify([token, effectiveWorkspace.id, programme])

  const [topics, setTopics] = useState([])
  const [loadedTreeKey, setLoadedTreeKey] = useState(null)
  const [lessonDetail, setLessonDetail] = useState(null)
  const [treeRevision, setTreeRevision] = useState(null)
  const [detailRevision, setDetailRevision] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lessonLoading, setLessonLoading] = useState(false)
  const [error, setError] = useState('')
  const treeRequestRef = useRef(0)
  const lessonRequestRef = useRef(0)

  const replaceUrl = useCallback((mutate) => {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const pushUrl = useCallback((mutate) => {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const loadTree = useCallback(async ({ throwOnError = false } = {}) => {
    const requestId = treeRequestRef.current + 1
    treeRequestRef.current = requestId
    lessonRequestRef.current += 1
    setLoading(true)
    setLessonLoading(false)
    setError('')
    setTopics([])
    setLessonDetail(null)
    setTreeRevision(null)
    setDetailRevision(null)
    try {
      const response = await listCurriculum(token, programme)
      if (treeRequestRef.current !== requestId) return response
      const data = response.data || {}
      const nextTopics = Array.isArray(data.topics) ? data.topics : []
      setTopics(nextTopics)
      setLoadedTreeKey(treeKey)
      setTreeRevision(Number.isSafeInteger(data.revision) ? data.revision : null)
      return response
    } catch (loadError) {
      if (treeRequestRef.current === requestId) {
        setError(loadError.message)
      }
      if (throwOnError) throw loadError
      return null
    } finally {
      if (treeRequestRef.current === requestId) setLoading(false)
    }
  }, [programme, token, treeKey])

  useEffect(() => {
    if (!urlProgramme || !programmes.includes(urlProgramme)) {
      replaceUrl((next) => {
        next.set('programme', String(programme))
        next.delete('topic')
        next.delete('lesson')
      })
    }
  }, [programme, programmes, replaceUrl, urlProgramme])

  useEffect(() => {
    loadTree()
    return () => { treeRequestRef.current += 1 }
  }, [loadTree])

  const selectedTopic = useMemo(() => {
    if (loadedTreeKey !== treeKey) return null
    const explicitTopic = topicId ? topics.find((topic) => topic.id === topicId) : null
    return findTopicForLesson(topics, lessonId) || explicitTopic
  }, [lessonId, topicId, topics, loadedTreeKey, treeKey])

  const selectedLesson = useMemo(() => {
    if (!lessonId) return null
    return selectedTopic?.lessons?.find((lesson) => lesson.id === lessonId) || null
  }, [lessonId, selectedTopic])

  useEffect(() => {
    if (loading || error || loadedTreeKey !== treeKey) return
    const resolvedTopic = selectedTopic?.id ?? null
    const resolvedLesson = selectedLesson?.id ?? null
    if (topicId === resolvedTopic && lessonId === resolvedLesson) return
    replaceUrl((next) => {
      if (resolvedTopic) next.set('topic', String(resolvedTopic))
      else next.delete('topic')
      if (resolvedLesson) next.set('lesson', String(resolvedLesson))
      else next.delete('lesson')
    })
  }, [loading, error, topicId, lessonId, selectedTopic, selectedLesson, replaceUrl, loadedTreeKey, treeKey])

  useEffect(() => {
    const requestId = lessonRequestRef.current + 1
    lessonRequestRef.current = requestId
    setLessonDetail(null)
    setDetailRevision(null)
    setLessonLoading(false)
    if (options.skipLessonDetail || !lessonId || loading) return undefined
    if (!selectedLesson) return undefined
    setError('')
    setLessonLoading(true)
    getCurriculumLesson(token, lessonId)
      .then((response) => {
        if (lessonRequestRef.current !== requestId) return
        const data = response.data || {}
        setLessonDetail(data)
        setDetailRevision(Number.isSafeInteger(data.revision) ? data.revision : null)
      })
      .catch((loadError) => {
        if (lessonRequestRef.current !== requestId) return
        setError(loadError.message)
        setLessonDetail(null)
      })
      .finally(() => {
        if (lessonRequestRef.current === requestId) setLessonLoading(false)
      })
    return () => {
      lessonRequestRef.current += 1
    }
  }, [lessonId, loading, options.skipLessonDetail, selectedLesson, token])

  const selectProgramme = useCallback((nextProgramme) => {
    const normalized = normalizeProgramme(nextProgramme?.programme ?? nextProgramme?.id ?? nextProgramme)
    if (!programmes.includes(normalized)) return
    pushUrl((next) => {
      next.set('programme', String(normalized))
      next.delete('topic')
      next.delete('lesson')
    })
  }, [programmes, pushUrl])

  const selectTopic = useCallback((nextTopicId) => {
    const id = parsePositiveId(nextTopicId)
    if (!id) return
    pushUrl((next) => {
      next.set('programme', String(programme))
      next.set('topic', String(id))
      next.delete('lesson')
    })
  }, [programme, pushUrl])

  const selectLesson = useCallback((nextLessonId) => {
    const id = parsePositiveId(nextLessonId)
    if (!id) return
    const parentTopic = findTopicForLesson(topics, id)
    pushUrl((next) => {
      next.set('programme', String(programme))
      if (parentTopic) next.set('topic', String(parentTopic.id))
      next.set('lesson', String(id))
    })
  }, [programme, pushUrl, topics])

  const backToTopics = useCallback(() => {
    pushUrl((next) => {
      next.set('programme', String(programme))
      if (selectedTopic) next.set('topic', String(selectedTopic.id))
      next.delete('lesson')
    })
  }, [programme, pushUrl, selectedTopic])

  const reload = useCallback(() => loadTree({ throwOnError: true }), [loadTree])

  return {
    programme,
    programmes,
    topics: loadedTreeKey === treeKey ? topics : [],
    selectedTopic,
    selectedLesson,
    lessonDetail: selectedLesson?.id === lessonDetail?.lesson?.id ? lessonDetail : null,
    revision: conservativeRevision(treeRevision, detailRevision),
    loading: loading || (loadedTreeKey !== treeKey && !error),
    lessonLoading,
    error,
    selectProgramme,
    selectTopic,
    selectLesson,
    backToTopics,
    reload,
  }
}

export default useCurriculumNavigation
