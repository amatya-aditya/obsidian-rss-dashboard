# Podcast Platform Support Plan

## Overview

Add support for importing podcast feeds from direct links to podcast platforms (Apple Podcasts, Spotify, Google Podcasts, etc.) instead of requiring users to manually find and paste the RSS feed URL.

## Supported Platforms

### Phase 1: Apple Podcasts
- **URL Pattern**: `https://podcasts.apple.com/{country}/{podcast-name}/{podcast-id}`
- **Example**: `https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584`
- **Lookup Method**: Apple iTunes Search API (`itunes.apple.com/lookup`)

### Phase 2: Spotify
- **URL Pattern**: `https://open.spotify.com/show/{show-id}`
- **Lookup Method**: Spotify API (requires OAuth)

### Phase 3: Google Podcasts
- **URL Pattern**: `https://podcasts.google.com/feed/{feed-id}`
- **Lookup Method**: Google Podcasts API

### Phase 4: Additional Platforms (Future)
- Amazon Music
- Stitcher
- TuneIn
- Overcast
- Pocket Casts

## Technical Implementation

### URL Detection

Each platform needs detection logic to identify its URLs and extract the platform-specific ID.

```typescript
interface PodcastPlatform {
  name: string;
  detect(url: string): boolean;
  extractId(url: string): string | null;
}
```

### Feed Resolution Flow

```
User Pastes URL
       │
       ▼
┌──────────────────┐
│  Detect Platform │
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
Apple    Other
 Podcasts   │
    │         ▼
    ▼    (Future)
┌────────────────────┐
│  Call Platform    │
│      API           │
└────────┬───────────┘
         │
         ▼
┌──────────────────┐
│  Get RSS Feed URL│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Fetch RSS Feed  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Import to Plugin │
└──────────────────┘
```

### Apple Podcasts Implementation

#### URL Patterns
- `https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584`
- `https://podcasts.apple.com/podcast/lex-fridman-podcast/id1434243584`
- ID format: `id{数字}` at end of URL

#### iTunes Search API
- **Endpoint**: `https://itunes.apple.com/lookup`
- **Parameters**:
  - `id`: The podcast ID (numeric)
  - `entity`: `podcast` (optional)
- **Response**: JSON containing `feedUrl` field

#### Example Request
```
GET https://itunes.apple.com/lookup?id=1434243584
```

#### Example Response
```json
{
  "resultCount": 1,
  "results": [
    {
      "wrapperType": "podcast",
      "artistName": "Lex Fridman",
      "trackName": "Lex Fridman Podcast",
      "feedUrl": "https://lexfridman.com/feed/podcast/",
      "artworkUrl600": "https://...",
      "genres": ["Technology", "Society & Culture"],
      "trackCount": 500
    }
  ]
}
```

### File Structure

```
src/
├── utils/
│   └── podcast-platforms.ts    # Platform detection & resolution
├── services/
│   ├── apple-podcasts.ts       # Apple Podcasts specific logic
│   ├── spotify.ts              # Spotify specific logic (future)
│   └── feed-parser.ts          # Updated to use platform resolution
└── modals/
    └── feed-manager-modal.ts    # Updated UI to handle platform URLs
```

## User Experience

### Adding a Feed

1. User clicks "Add Feed"
2. User pastes Apple Podcasts URL (e.g., `https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584`)
3. User clicks "Load" button
4. Plugin detects Apple Podcasts URL
5. Plugin calls iTunes API to resolve RSS feed URL
6. Plugin fetches RSS feed and extracts title
7. Form populates with resolved title and RSS feed URL
8. User can modify folder, settings, and save

### Error Handling

- **Invalid URL**: Show error message "Invalid podcast platform URL"
- **API Error**: Show error "Could not resolve podcast feed. Please check the URL."
- **No Feed Found**: Show error "Podcast not found. Please verify the URL is correct."

## Configuration

### Settings

Add plugin settings for podcast platform features:

```typescript
interface PodcastSettings {
  defaultPodcastFolder: string;
  defaultPodcastTag: string;
  autoDetectPlatformUrls: boolean; // Enable/disable auto-detection
}
```

### Default Behavior

- Auto-detect podcast platform URLs when pasting
- Show indicator that platform was detected (e.g., "Apple Podcasts detected")
- Allow manual override of resolved RSS URL

## Testing

### Apple Podcasts Test Cases

| Input | Expected ID | Expected Feed |
|-------|-------------|---------------|
| `https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584` | `1434243584` | `https://lexfridman.com/feed/podcast/` |
| `https://podcasts.apple.com/podcast/the-daily/id1434243584` | `1434243584` | `https://feeds.simplecast.com/`... |
| `https://podcasts.apple.com/ca/podcast/my-podcast/id9999999999` | `9999999999` | Error: Not found |

## Future Considerations

### Authentication
- Spotify requires OAuth for API access
- Consider user-authenticatedSpotify for premium features

### Caching
- Cache platform API responses to reduce calls
- Invalidate cache after 24 hours

### Batch Import
- Allow importing multiple podcasts from platform search results

### Platform Search
- Add ability to search within platforms (e.g., "Search Apple Podcasts for...")
