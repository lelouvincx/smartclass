import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { UNSAFE_NavigationContext } from 'react-router-dom'

function historyIdx(state = window.history.state) {
  return typeof state?.idx === 'number' ? state.idx : null
}

function isPlainLeftClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey
}

function shouldLetBrowserHandle(anchor) {
  return anchor.target || anchor.hasAttribute('download') || anchor.getAttribute('rel') === 'external'
}

export default function useCurriculumDraftGuard({ blocked, onLeave }) {
  const navigation = useContext(UNSAFE_NavigationContext)
  const navigator = navigation?.navigator
  const blockedRef = useRef(Boolean(blocked))
  const onLeaveRef = useRef(onLeave)
  const currentIdxRef = useRef(historyIdx())
  const suppressPopRef = useRef(false)
  const replayingPopRef = useRef(false)
  blockedRef.current = Boolean(blocked)
  onLeaveRef.current = onLeave

  useLayoutEffect(() => {
    if (!navigator) return undefined
    const original = {
      push: navigator.push,
      replace: navigator.replace,
      go: navigator.go,
    }

    if (typeof original.push === 'function') {
      navigator.push = function guardedPush(to, state, options) {
        if (!blockedRef.current) {
          const result = original.push.call(navigator, to, state, options)
          currentIdxRef.current = historyIdx()
          return result
        }
        onLeaveRef.current?.({
          type: 'push',
          to,
          state,
          options,
          retry: () => {
            const result = original.push.call(navigator, to, state, options)
            currentIdxRef.current = historyIdx()
            return result
          },
        })
        return undefined
      }
    }

    if (typeof original.replace === 'function') {
      navigator.replace = function guardedReplace(to, state, options) {
        if (!blockedRef.current) {
          const result = original.replace.call(navigator, to, state, options)
          currentIdxRef.current = historyIdx()
          return result
        }
        onLeaveRef.current?.({
          type: 'replace',
          to,
          state,
          options,
          retry: () => {
            const result = original.replace.call(navigator, to, state, options)
            currentIdxRef.current = historyIdx()
            return result
          },
        })
        return undefined
      }
    }

    if (typeof original.go === 'function') {
      navigator.go = function guardedGo(delta) {
        if (!blockedRef.current) return original.go.call(navigator, delta)
        onLeaveRef.current?.({
          type: 'go',
          delta,
          retry: () => original.go.call(navigator, delta),
        })
        return undefined
      }
    }

    return () => {
      if (navigator.push?.name === 'guardedPush') navigator.push = original.push
      if (navigator.replace?.name === 'guardedReplace') navigator.replace = original.replace
      if (navigator.go?.name === 'guardedGo') navigator.go = original.go
    }
  }, [navigator])

  useEffect(() => {
    function beforeUnload(event) {
      if (!blockedRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  useEffect(() => {
    function handleExternalClick(event) {
      if (!blockedRef.current || !isPlainLeftClick(event)) return
      const anchor = event.target.closest?.('a[href]')
      if (!anchor || shouldLetBrowserHandle(anchor)) return
      const rawHref = anchor.getAttribute('href')
      if (!rawHref || rawHref.startsWith('#')) return
      const url = new URL(rawHref, window.location.href)
      if (url.origin === window.location.origin) return

      event.preventDefault()
      event.stopPropagation()
      onLeaveRef.current?.({
        type: 'external',
        href: url.href,
        retry: () => window.location.assign(url.href),
      })
    }

    document.addEventListener('click', handleExternalClick, true)
    return () => document.removeEventListener('click', handleExternalClick, true)
  }, [])

  useEffect(() => {
    function handlePopState(event) {
      const nextIdx = historyIdx(event.state)

      if (suppressPopRef.current) {
        suppressPopRef.current = false
        currentIdxRef.current = historyIdx()
        event.stopImmediatePropagation?.()
        return
      }

      if (replayingPopRef.current) {
        replayingPopRef.current = false
        currentIdxRef.current = nextIdx
        return
      }

      const oldIdx = currentIdxRef.current
      if (!blockedRef.current) {
        currentIdxRef.current = nextIdx
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation?.()

      const delta = typeof oldIdx === 'number' && typeof nextIdx === 'number' ? nextIdx - oldIdx : null
      if (delta) {
        suppressPopRef.current = true
        window.history.go(-delta)
      }

      onLeaveRef.current?.({
        type: 'pop',
        delta,
        fromIdx: oldIdx,
        toIdx: nextIdx,
        state: event.state,
        retry: () => {
          if (!delta) return
          replayingPopRef.current = true
          window.history.go(delta)
        },
      })
    }

    window.addEventListener('popstate', handlePopState, true)
    return () => window.removeEventListener('popstate', handlePopState, true)
  }, [])
}
