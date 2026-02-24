# YouTube Auto-Folder Assignment Debug

## Issue Summary

When adding a YouTube channel via the Add Feed modal, the folder should automatically be set to "Videos" (or the configured `defaultYouTubeFolder` setting). However, the auto-folder assignment was not working - feeds still defaulted to "Uncategorized".

## Solutions Attempted

### Attempt 1: Direct Assignment in YouTube URL Handler (FAILED)

**Location**: `src/modals/feed-manager-modal.ts` (AddFeedModal class)

**Approach**: Set `folderInput.value` directly when a YouTube URL is detected during the Load button click handler.

**Result**: Failed - `folderInput` is `undefined` at this point because the Folder setting hasn't been created yet.

### Attempt 2: Deferred Assignment with Flag Variable (FAILED)

**Location**: `src/modals/feed-manager-modal.ts` (AddFeedModal class)

**Approach**: Use a `pendingYouTubeFolder` flag to store the folder value, then apply it after `folderInput` is created.

**Result**: Failed - The `pendingYouTubeFolder` check runs synchronously during `onOpen()` execution, NOT when the async Load handler completes.

## Root Cause Analysis

The modal's `onOpen()` method executes synchronously from top to bottom:

1. Variables are declared
2. The Feed URL setting is created with the Load button handler (handler is defined but NOT executed)
3. The Title setting is created
4. The Folder setting is created and `folderInput` is assigned
5. The pending folder check runs immediately (synchronously)

**The Problem**: The Load button click handler is an ASYNC callback that runs when the user clicks "Load". By the time the user clicks Load, the entire `onOpen()` method has already completed. However, the `pendingYouTubeFolder` check was running synchronously during `onOpen()`, not after the async Load handler finished.

## Solution Implemented: Direct Assignment Inside Load Handler

**Status**: ✅ IMPLEMENTED

**Approach**: Apply the folder assignment directly inside the Load button's async click handler, after the YouTube URL is resolved. Since `folderInput` is already assigned by the time the user clicks Load (the modal is fully rendered), we can set it directly.

```typescript
// In the Load button click handler (lines 576-582)
if (isYouTubePageUrl(url)) {
  // ... URL resolution code ...

  // Auto-set folder to default YouTube folder
  const defaultYouTubeFolder =
    this.plugin?.settings?.media?.defaultYouTubeFolder || "Videos";
  if (folderInput && !folderInput.value) {
    folder = defaultYouTubeFolder;
    folderInput.value = defaultYouTubeFolder;
  }
}
```

**Why this works**:

- The Load handler runs AFTER `onOpen()` completes
- At that point, `folderInput` is fully assigned and available
- We're setting the value in response to user action, not during modal initialization
- No flag variables or complex state management needed

## Code Location

File: `src/modals/feed-manager-modal.ts`
Class: `AddFeedModal`
Method: `onOpen()`
Lines: ~576-582 (folder assignment in Load button click handler)
