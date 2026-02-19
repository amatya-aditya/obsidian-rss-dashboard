# Feed Icon Override Settings

## Overview

Add a new "Icons" settings section in the Display tab that allows users to choose between:

1. Using default icons for podcast/video feeds (current behavior)
2. Showing the actual feed artwork/icon from the RSS feed

## Current Behavior

Currently in [`sidebar.ts`](src/components/sidebar.ts:510-582), feed icons are rendered as:

- **Video feeds**: Always show a play icon (purple video icon)
- **Podcast feeds**: Always show a mic icon (purple microphone icon)
- **Regular feeds**: Show domain favicon (if enabled) or RSS icon

The feed parser already extracts feed artwork URLs from:

- iTunes image (`itunes:image` href attribute)
- Standard feed image (`<image><url>...</url></image>`)

However, these images are not currently stored on the Feed object or displayed in the sidebar.

## Implementation Plan

### Phase 1: Update Types and Settings

#### 1.1 Add `iconUrl` to Feed Interface

**File**: [`src/types/types.ts`](src/types/types.ts:58-75)

```typescript
export interface Feed {
	title: string;
	url: string;
	folder: string;
	items: FeedItem[];
	lastUpdated: number;
	author?: string;
	mediaType?: "article" | "video" | "podcast";
	autoDetect?: boolean;
	customTemplate?: string;
	customFolder?: string;
	customTags?: string[];
	autoDeleteDuration?: number;
	maxItemsLimit?: number;
	scanInterval?: number;
	iconUrl?: string; // NEW: Feed artwork/icon URL
}
```

#### 1.2 Add Icon Settings to DisplaySettings

**File**: [`src/types/types.ts`](src/types/types.ts:149-166)

```typescript
export interface DisplaySettings {
	showCoverImage: boolean;
	showSummary: boolean;
	filterDisplayStyle: "vertical" | "inline";
	defaultFilter:
		| "all"
		| "starred"
		| "unread"
		| "read"
		| "saved"
		| "videos"
		| "podcasts";
	hiddenFilters: string[];
	useDomainFavicons: boolean;
	hideDefaultRssIcon: boolean;
	autoHideOnReadToggle: boolean;
	autoHideDuration: number;
	// NEW: Icon override settings
	overridePodcastIcons: boolean; // Default: true (current behavior)
	overrideVideoIcons: boolean; // Default: true (current behavior)
}
```

#### 1.3 Update DEFAULT_SETTINGS

**File**: [`src/types/types.ts`](src/types/types.ts:308-318)

```typescript
display: {
    showCoverImage: true,
    showSummary: true,
    filterDisplayStyle: "inline",
    defaultFilter: "all",
    hiddenFilters: [],
    useDomainFavicons: true,
    hideDefaultRssIcon: false,
    autoHideOnReadToggle: false,
    autoHideDuration: 0,
    // NEW defaults
    overridePodcastIcons: true,
    overrideVideoIcons: true,
},
```

### Phase 2: Update Feed Parser

#### 2.1 Store Feed Icon URL During Parsing

**File**: [`src/services/feed-parser.ts`](src/services/feed-parser.ts:2458-2465)

Modify the `parseFeed` method to extract and store the feed icon URL:

```typescript
// Extract feed logo/artwork
const feedLogoCandidates = [
	parsed.feedItunesImage,
	parsed.feedImageUrl,
	parsed.image && typeof parsed.image === "object" ? parsed.image.url : "",
	typeof parsed.image === "string" ? parsed.image : "",
].filter(Boolean);
const feedLogoUrl = feedLogoCandidates.length > 0 ? feedLogoCandidates[0] : "";

// Store on feed object
newFeed.iconUrl = feedLogoUrl
	? this.convertToAbsoluteUrl(feedLogoUrl, url)
	: "";
```

### Phase 3: Update Settings UI

#### 3.1 Add Icons Section to Display Settings

**File**: [`src/settings/settings-tab.ts`](src/settings/settings-tab.ts:506-584)

Add after the "Filter visibility" section (after line 584):

```typescript
// Add separator
containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

// Icon settings section
new Setting(containerEl).setName("Icons").setHeading();
containerEl.createEl("p", {
	text: "Choose whether to use default icons or show actual feed artwork:",
	cls: "rss-dashboard-settings-description",
});

new Setting(containerEl)
	.setName("Override podcast icons")
	.setDesc(
		"When enabled, all podcast feeds show a default microphone icon. When disabled, the actual podcast artwork from the feed is displayed.",
	)
	.addToggle((toggle) =>
		toggle
			.setValue(this.plugin.settings.display.overridePodcastIcons ?? true)
			.onChange(async (value) => {
				this.plugin.settings.display.overridePodcastIcons = value;
				await this.plugin.saveSettings();
				const view = await this.plugin.getActiveDashboardView();
				if (view?.sidebar) {
					await this.app.workspace.revealLeaf(view.leaf);
					view.sidebar.render();
				}
			}),
	);

new Setting(containerEl)
	.setName("Override video icons")
	.setDesc(
		"When enabled, all video feeds show a default play icon. When disabled, the actual channel artwork from the feed is displayed.",
	)
	.addToggle((toggle) =>
		toggle
			.setValue(this.plugin.settings.display.overrideVideoIcons ?? true)
			.onChange(async (value) => {
				this.plugin.settings.display.overrideVideoIcons = value;
				await this.plugin.saveSettings();
				const view = await this.plugin.getActiveDashboardView();
				if (view?.sidebar) {
					await this.app.workspace.revealLeaf(view.leaf);
					view.sidebar.render();
				}
			}),
	);
```

### Phase 4: Update Sidebar Rendering

#### 4.1 Modify Feed Icon Rendering Logic

**File**: [`src/components/sidebar.ts`](src/components/sidebar.ts:510-582)

Update the `renderFeed` method to check settings and display appropriate icon:

```typescript
private renderFeed(feed: Feed, container: HTMLElement): void {
    // ... existing code ...

    const feedIcon = feedNameContainer.createDiv({
        cls: "rss-dashboard-feed-icon",
    });

    // Check if processing
    const isProcessing = feed.items.length === 0 && this.plugin?.backgroundImportQueue?.some(
        (queuedFeed: FeedMetadata) => queuedFeed.url === feed.url && queuedFeed.importStatus === 'processing'
    );

    if (isProcessing) {
        setIcon(feedIcon, "loader-2");
        feedIcon.addClass("processing");
        feedEl.classList.add('processing-feed');
    } else if (feed.mediaType === 'video') {
        // Check if we should override video icons
        const overrideVideoIcons = this.settings.display.overrideVideoIcons ?? true;

        if (!overrideVideoIcons && feed.iconUrl) {
            // Show actual feed artwork
            this.renderFeedArtwork(feedIcon, feed.iconUrl, 'video');
        } else {
            // Show default play icon
            setIcon(feedIcon, "play");
            feedIcon.addClass("youtube");
            feedEl.classList.add('youtube-feed');
        }
    } else if (feed.mediaType === 'podcast') {
        // Check if we should override podcast icons
        const overridePodcastIcons = this.settings.display.overridePodcastIcons ?? true;

        if (!overridePodcastIcons && feed.iconUrl) {
            // Show actual feed artwork
            this.renderFeedArtwork(feedIcon, feed.iconUrl, 'podcast');
        } else {
            // Show default mic icon
            setIcon(feedIcon, "mic");
            feedIcon.addClass("podcast");
            feedEl.classList.add('podcast-feed');
        }
    } else if (this.settings.display.useDomainFavicons) {
        // ... existing favicon logic ...
    }
    // ... rest of existing code ...
}
```

#### 4.2 Add Helper Method for Feed Artwork

**File**: [`src/components/sidebar.ts`](src/components/sidebar.ts)

Add new method after `getFaviconUrl`:

```typescript
/**
 * Render feed artwork image with fallback
 */
private renderFeedArtwork(
    container: HTMLElement,
    iconUrl: string,
    mediaType: 'video' | 'podcast'
): void {
    container.empty();
    const imgEl = container.createEl("img", {
        attr: {
            src: iconUrl,
            alt: "Feed artwork"
        },
        cls: "rss-dashboard-feed-artwork"
    });

    // Fallback to default icon if image fails to load
    imgEl.onerror = () => {
        container.empty();
        if (mediaType === 'video') {
            setIcon(container, "play");
            container.addClass("youtube");
        } else {
            setIcon(container, "mic");
            container.addClass("podcast");
        }
    };
}
```

### Phase 5: Add CSS Styles

#### 5.1 Add Styles for Feed Artwork

**File**: [`src/styles/sidebar.css`](src/styles/sidebar.css)

```css
/* Feed artwork images */
.rss-dashboard-feed-artwork {
	width: 16px;
	height: 16px;
	border-radius: 3px;
	object-fit: cover;
}

/* Ensure artwork container sizing is consistent */
.rss-dashboard-feed-icon:has(.rss-dashboard-feed-artwork) {
	display: flex;
	align-items: center;
	justify-content: center;
}
```

## Migration Considerations

### Existing Feeds

- Existing feeds will not have `iconUrl` populated
- The feed parser will populate `iconUrl` on next refresh
- Fallback behavior: If `iconUrl` is empty, show default icon regardless of settings

### Backward Compatibility

- Default settings maintain current behavior (override = true)
- Users must explicitly opt-in to show feed artwork

## Testing Checklist

- [ ] New settings appear in Display tab under "Icons" section
- [ ] Toggle for podcast icons works correctly
- [ ] Toggle for video icons works correctly
- [ ] Feed artwork displays when override is disabled
- [ ] Fallback to default icon when artwork fails to load
- [ ] Fallback to default icon when feed has no iconUrl
- [ ] Settings persist after restart
- [ ] Existing feeds work correctly (no iconUrl initially)
- [ ] Feed refresh populates iconUrl correctly

## Files to Modify

1. `src/types/types.ts` - Add settings and iconUrl field
2. `src/services/feed-parser.ts` - Store iconUrl during parsing
3. `src/settings/settings-tab.ts` - Add UI controls
4. `src/components/sidebar.ts` - Update rendering logic
5. `src/styles/sidebar.css` - Add artwork styles
