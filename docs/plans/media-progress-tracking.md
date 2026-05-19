# Media Progress Tracking Implementation Plan (Policy Compliant)

This document outlines the steps to implement policy-compliant media progress tracking for YouTube and podcasts.

## YouTube Policy Compliance (RMF)

The implementation strictly adheres to YouTube's Developer Policies and Required Minimum Functionality (RMF):

1.  **Background Playback Prohibited**: The video will automatically pause when the ReaderView is closed or hidden.
2.  **No Overlays**: No visual elements will be placed over the YouTube player or its controls.
3.  **Minimum Size**: The player container will maintain a minimum viewport of 200px x 200px.
4.  **TOS Disclosure**: A link to YouTube's Terms of Service will be added to the plugin settings.
5.  **Data Storage**: Playback position is stored locally in `data.json` as app-specific user state. No YouTube API Data (metadata) will be cached for more than 30 days.

## User Review Required

> [!IMPORTANT]
> This implementation introduces a local storage mechanism for playback history in `data.json`. Users should be aware that their "Continue Watching" state is kept within their vault.

> [!NOTE]
> A YouTube Terms of Service link will be added to the plugin settings to comply with Section III.A.1 of the YouTube Developer Policies.

## Proposed Changes

### 1. Types
Modify `src/types/types.ts` to add `playbackProgress` to `FeedItem`.

### 2. Media Service
Update `src/services/media-service.ts` -> `buildYouTubeEmbed` to include `enablejsapi=1` and `origin`.

### 3. Video Player
Update `src/views/video-player.ts`:
- Implement YouTube IFrame API integration.
- Track `onStateChange` (PLAYING, PAUSED, ENDED).
- Periodic progress updates via `onPlaybackProgress` callback.
- Pause video in `destroy()`.

### 4. Podcast Player
Update `src/views/podcast-player.ts`:
- Refactor to use `onPlaybackProgress` callback.
- Read initial position from `item.playbackProgress`.

### 5. Main Plugin
Update `main.ts`:
- Add `updatePlaybackProgress` debounced method.
- Implement `migrateMediaProgressOnStartup`.
- Add YouTube TOS link to settings.

### 6. Plumbing
Update `ArticleRenderer`, `DashboardView`, and `ReaderView` to pass callbacks.

## Verification Plan

### Automated Tests
- Run existing unit tests: `npm test`.
- Add new tests for `updatePlaybackProgress` and migration logic.

### Manual Verification
1.  **Resume Playback**: Start a video/podcast, wait for save, close reader, reopen. Verify it resumes.
2.  **Policy Check**: Close view while video is playing. Verify it stops.
3.  **Migration**: Mock `localStorage` data and verify it moves to `data.json` on startup.
