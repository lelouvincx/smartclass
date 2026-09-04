---
rfc: RFC-12
title: Local lecture playback resume
date: 2026-09-04
status: Implemented
dependencies: [RFC-10]
---

# RFC: Local lecture playback resume

## Summary

SmartClass will remember an authenticated student's position in each YouTube lecture and restore it after a refresh or later visit in the same browser. Progress remains local to that browser and device. The feature does not add completion tracking, analytics, or cross-device synchronization.

The current student player is a plain privacy-enhanced YouTube iframe, so a refresh creates a new player at the beginning. The implementation will use the YouTube IFrame Player API to observe playback and `localStorage` to persist the latest position. Restoration will use YouTube's `start` embed parameter rather than an imperative seek, preserving normal paused startup and still working if the Player API script fails.

## Goals

- Restore each student's saved position after refreshing or revisiting a lecture in the same browser.
- Isolate progress by account, lecture, and YouTube video so accounts and replacement videos never share a position.
- Keep the ordinary embedded player usable when the Player API or browser storage is unavailable.
- Preserve the existing privacy-enhanced embed domain, responsive layout, controls, fullscreen support, and direct YouTube fallback.
- Avoid autoplay and visible loading or error UI for the persistence enhancement.

## Non-goals

- Synchronizing progress between browsers or devices.
- Tracking completion, watch history, engagement, or analytics.
- Showing progress in the curriculum or teacher interface.
- Remembering playback rate, volume, captions, or player quality.
- Persisting progress for teacher previews.
- Guest progress; guest lecture access remains separate planned work.

## Approved experience

- When a student first opens a lecture, playback begins at the start as it does today.
- After the student watches part of a lecture, refreshing or revisiting it in the same browser restores the latest saved position without starting playback automatically.
- Pausing or leaving the page saves the most recent available position immediately.
- Reaching YouTube's actual `ENDED` state clears the saved position so the next visit begins at the start.
- A position close to the end still resumes normally. Near-end thresholds would imply completion semantics and are outside this RFC.
- If storage access or the Player API fails, the lecture remains playable from the beginning with no additional error state.

## Storage contract

Use one versioned `localStorage` entry per account, lecture, and YouTube video:

`smartclass-lecture-progress-v1:<accountId>:<lectureId>:<videoId>`

The stored value is the latest whole, non-negative playback second. The storage helper must:

- accept only finite, non-negative numbers when reading or writing;
- treat absent, malformed, or impossible values as no saved progress;
- catch failures while obtaining storage and while calling `getItem`, `setItem`, or `removeItem`;
- expose read, write, and remove operations without leaking storage concerns into the player lifecycle;
- retain namespaced progress on logout so it remains available when the same account signs in again.

Including the YouTube video ID prevents a teacher's replacement video from inheriting progress saved for the previous URL while retaining the same lecture ID.

## Player integration

### Embed URL

Extend the lecture embed helper with optional player parameters while preserving its current output for existing callers. The student player supplies:

- `start=<saved whole second>` when a valid positive position exists;
- `enablejsapi=1` so playback can be observed;
- `origin=<window.location.origin>` as required by YouTube for IFrame API integrations.

Teacher previews continue calling the helper without these options and retain their current exact URL and behavior.

Restoration must not call `seekTo()` or `playVideo()`. The `start` parameter provides a passive initial position, avoids accidental autoplay, and works even when the API loader fails.

### DOM ownership

Extract a small student-only player component keyed by account ID, lecture ID, and video ID. React owns a stable host element. The component imperatively inserts the fallback iframe into that host immediately, then lets `YT.Player` attach to that exact iframe after the API is available.

This ownership boundary is required because `YT.Player.destroy()` removes its iframe. YouTube must not destroy an iframe that React still believes it owns, particularly during React Strict Mode's setup and cleanup cycle.

The current responsive wrapper, iframe title, permissions, referrer policy, and fullscreen behavior remain unchanged.

### Shared API loader

Add one module-level YouTube IFrame API loader promise. It must:

- resolve immediately when `window.YT.Player` is already available;
- assign and reuse one promise before inserting a script;
- reuse an existing `https://www.youtube.com/iframe_api` script;
- preserve and invoke an existing `window.onYouTubeIframeAPIReady` callback, settling its own promise even if that callback throws;
- reject on script load failure without removing or replacing the ordinary iframe;
- remain loaded across player cleanup, while each player instance owns and removes only its own listeners and timers.

### Save lifecycle

- Snapshot the saved position when the keyed player mounts and use that snapshot to build the iframe URL.
- After the API resolves, attach only if the effect remains active and its host still contains the same iframe. This prevents a late loader result from attaching to a replaced lecture.
- On readiness, inspect the current player state in case playback began before API attachment.
- While the state is `PLAYING`, run exactly one five-second interval that stores `Math.floor(player.getCurrentTime())`.
- On every non-playing state, stop the interval. Flush on `PAUSED` and when leaving playback.
- Flush when the document becomes hidden, on `pagehide`, and during component cleanup before destroying the player.
- On `ENDED`, remove progress and mark the lifecycle ended. Queued timers, page lifecycle events, and cleanup must not recreate the entry afterward.
- Treat Player API calls as fallible. A persistence failure must never interrupt playback.

## Implementation plan

1. Add focused failing unit tests for the versioned progress-storage contract, including account, lecture, and video isolation; invalid values; removals; and throwing storage implementations.
2. Add the storage helper and expose or reuse one canonical YouTube video-ID parser so storage identity and embed generation cannot disagree.
3. Add failing tests for optional `start`, `enablejsapi`, and encoded `origin` embed parameters while proving teacher-style calls retain the current exact embed URL.
4. Add and test the shared IFrame API loader, covering concurrent calls, an already-loaded API, an existing global callback, script failure, and script reuse.
5. Add the keyed student player component and lifecycle tests covering passive restoration without autoplay, playing-only periodic saves, pause and page-exit flushes, ended removal, API/storage failure fallback, late loader resolution, and cleanup.
6. Integrate the component into the student lecture page using `user.id`; keep invalid-link and fallback behavior unchanged.
7. Update `PRODUCT.md` when the behavior ships, remove the task from `TODO.md`, and add the completed change under `[Unreleased]` in `CHANGELOG.md`.
8. Run the focused lecture and helper tests, then `npm test`, `npm run test:worker`, `npm run test:integration`, and `npm run build`. Manually verify refresh, revisit, account isolation, replaced-video behavior, completion reset, mobile playback, and disabled-storage/API-failure fallbacks.

## Acceptance criteria

- Refreshing or revisiting a partially watched lecture in the same browser loads it at the last saved whole second without autoplay.
- Saved positions are isolated by authenticated account, lecture, and YouTube video ID.
- A changed YouTube URL under the same lecture starts at zero.
- Progress is written at most once every five seconds while playing and is flushed on pause, hidden/page-exit lifecycle events, and component cleanup.
- An actual ended event clears progress and later cleanup cannot recreate it.
- No timer, event listener, player, iframe, or global callback is duplicated after lecture changes or React Strict Mode remounts.
- Player API or storage failure leaves the existing YouTube embed usable without an enhancement-specific error.
- Teacher previews and unsupported-URL behavior remain unchanged.

## References

- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube embedded player parameters](https://developers.google.com/youtube/player_parameters)
