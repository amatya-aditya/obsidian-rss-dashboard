# Installation Methods

The easiest way to install RSS Dashboard is through the [Community Plugins Directory](../README.md#installation). For beta testing or manual setup, see the methods below.

## BRAT Beta Testing

Install the latest beta release using BRAT (Beta Releases for Obsidian Test Plugins).

### Prerequisites

- Install BRAT from Obsidian's Community Plugins browser first

### Steps

1. Open the command palette in Obsidian and run `BRAT: Add a beta plugin for testing`.
2. Paste the repository URL: `https://github.com/amatya-aditya/obsidian-rss-dashboard`
3. Select the latest version when prompted.
4. Click **Add Plugin** and wait for BRAT to finish.
5. Open **Settings** > **Community plugins**.
6. Refresh the plugin list if needed.
7. Find **RSS Dashboard** and enable it.

## Manual Installation

Install by directly downloading release files and copying them to your plugins directory.

### Prerequisites

- Access to your vault's `.obsidian/plugins` directory

### Steps

1. Download the latest release files from the [Releases page](https://github.com/amatya-aditya/obsidian-rss-dashboard/releases):
   - `manifest.json`
   - `styles.css`
   - `main.js`

2. Create a folder named `rss-dashboard` in your vault's `.obsidian/plugins` directory.

3. Copy the downloaded files into that folder:
   ```
   .obsidian/plugins/rss-dashboard/
   ├── manifest.json
   ├── styles.css
   └── main.js
   ```

4. Open **Settings** > **Community plugins** and enable **RSS Dashboard**.
   - You may need to restart Obsidian before it appears in the plugin list.

## Next Steps

Once installed, see the [Getting Started Guide](./getting-started.md) to add your first feed.
