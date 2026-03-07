import type { DataAdapter } from "obsidian";
import type { Feed, FeedItem, Folder, Tag } from "../types/types";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import sqlWasmBinary from "../../node_modules/sql.js/dist/sql-wasm.wasm";

const DB_FILENAME = "rss-dashboard.sqlite";
const SCHEMA_VERSION = 2;

export class DatabaseService {
    private db: Database | null = null;
    private SQL: SqlJsStatic | null = null;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private pluginDir = "";
    private adapter: DataAdapter | null = null;

    async init(pluginDir: string, adapter: DataAdapter): Promise<void> {
        this.pluginDir = pluginDir;
        this.adapter = adapter;

        // WASM binary is inlined in the bundle by esbuild (binary loader)
        // This ensures it works regardless of install method (BRAT, manual, etc.)
        const wasmBuffer = sqlWasmBinary.buffer;
        this.SQL = await initSqlJs({ wasmBinary: wasmBuffer as ArrayBuffer });

        // Try to load existing database
        const dbPath = `${pluginDir}/${DB_FILENAME}`;
        try {
            const existingData = await adapter.readBinary(dbPath);
            this.db = new this.SQL.Database(new Uint8Array(existingData));
        } catch {
            // No existing DB - create new
            this.db = new this.SQL.Database();
        }

        this.createSchema();
    }

    isInitialized(): boolean {
        return this.db !== null;
    }

    hasData(): boolean {
        if (!this.db) return false;
        const result = this.db.exec("SELECT COUNT(*) FROM feeds");
        return result.length > 0 && (result[0].values[0][0] as number) > 0;
    }

    private createSchema(): void {
        if (!this.db) return;

        this.db.run("PRAGMA journal_mode=WAL");
        this.db.run("PRAGMA foreign_keys=ON");

        this.db.run(`
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS feeds (
                url TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                folder TEXT NOT NULL DEFAULT '',
                last_updated INTEGER NOT NULL DEFAULT 0,
                author TEXT,
                media_type TEXT DEFAULT 'article',
                auto_detect INTEGER DEFAULT 0,
                custom_template TEXT,
                custom_folder TEXT,
                custom_tags TEXT,
                auto_delete_duration INTEGER DEFAULT 0,
                max_items_limit INTEGER DEFAULT 25,
                scan_interval INTEGER DEFAULT 0,
                icon_url TEXT,
                filters TEXT
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL,
                feed_url TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                link TEXT NOT NULL DEFAULT '',
                description TEXT DEFAULT '',
                content TEXT DEFAULT '',
                pub_date TEXT DEFAULT '',
                author TEXT DEFAULT '',
                summary TEXT DEFAULT '',
                cover_image TEXT DEFAULT '',
                feed_title TEXT DEFAULT '',
                read INTEGER NOT NULL DEFAULT 0,
                starred INTEGER NOT NULL DEFAULT 0,
                saved INTEGER NOT NULL DEFAULT 0,
                saved_file_path TEXT,
                tags TEXT DEFAULT '[]',
                media_type TEXT DEFAULT 'article',
                video_id TEXT,
                video_url TEXT,
                audio_url TEXT,
                duration TEXT,
                explicit INTEGER DEFAULT 0,
                image TEXT,
                category TEXT,
                episode_type TEXT,
                season INTEGER,
                episode INTEGER,
                enclosure TEXT,
                itunes TEXT,
                ieee TEXT,
                UNIQUE(feed_url, guid),
                FOREIGN KEY (feed_url) REFERENCES feeds(url) ON DELETE CASCADE
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                parent_id INTEGER,
                created_at INTEGER,
                modified_at INTEGER,
                pinned INTEGER DEFAULT 0,
                FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
            )
        `);

        this.db.run(`
            CREATE TABLE IF NOT EXISTS tags (
                name TEXT PRIMARY KEY,
                color TEXT NOT NULL DEFAULT '#3498db'
            )
        `);

        // Indexes for common queries
        this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_feed_url ON articles(feed_url)");
        this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_read ON articles(read)");
        this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_starred ON articles(starred)");
        this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_saved ON articles(saved)");
        this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date)");
        this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_media_type ON articles(media_type)");
        this.db.run("CREATE INDEX IF NOT EXISTS idx_feeds_folder ON feeds(folder)");

        // Schema migrations
        const version = this.getSchemaVersion();
        if (version === 0) {
            this.setSchemaVersion(SCHEMA_VERSION);
        } else if (version < SCHEMA_VERSION) {
            this.migrateSchema(version);
        }
    }

    private migrateSchema(fromVersion: number): void {
        if (!this.db) return;
        if (fromVersion < 2) {
            // Add columns introduced after schema v1
            try { this.db.run("ALTER TABLE feeds ADD COLUMN icon_url TEXT"); } catch { /* already exists */ }
            try { this.db.run("ALTER TABLE feeds ADD COLUMN filters TEXT"); } catch { /* already exists */ }
        }
        this.setSchemaVersion(SCHEMA_VERSION);
    }

    getSchemaVersion(): number {
        if (!this.db) return 0;
        const result = this.db.exec("SELECT value FROM meta WHERE key = 'schema_version'");
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return parseInt(result[0].values[0][0] as string, 10) || 0;
    }

    private setSchemaVersion(version: number): void {
        if (!this.db) return;
        this.db.run(
            "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
            [version.toString()]
        );
    }

    // ─── Feed CRUD ───────────────────────────────────────────

    saveAllFeeds(feeds: Feed[]): void {
        if (!this.db) return;

        this.db.run("BEGIN TRANSACTION");
        try {
            // Get existing feed URLs
            const existingUrls = new Set<string>();
            const urlResult = this.db.exec("SELECT url FROM feeds");
            if (urlResult.length > 0) {
                for (const row of urlResult[0].values) {
                    existingUrls.add(row[0] as string);
                }
            }

            // Track which feeds we still have
            const currentUrls = new Set(feeds.map(f => f.url));

            // Delete feeds that no longer exist
            for (const url of existingUrls) {
                if (!currentUrls.has(url)) {
                    this.db.run("DELETE FROM feeds WHERE url = ?", [url]);
                    // Articles will cascade delete due to FK
                }
            }

            // Upsert feeds and their articles
            for (const feed of feeds) {
                this.upsertFeed(feed);
                this.syncArticlesForFeed(feed.url, feed.items);
            }

            this.db.run("COMMIT");
        } catch (e) {
            this.db.run("ROLLBACK");
            throw e;
        }
    }

    private upsertFeed(feed: Feed): void {
        if (!this.db) return;
        this.db.run(`
            INSERT OR REPLACE INTO feeds (
                url, title, folder, last_updated, author, media_type,
                auto_detect, custom_template, custom_folder, custom_tags,
                auto_delete_duration, max_items_limit, scan_interval,
                icon_url, filters
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            feed.url,
            feed.title,
            feed.folder,
            feed.lastUpdated,
            feed.author || null,
            feed.mediaType || 'article',
            feed.autoDetect ? 1 : 0,
            feed.customTemplate || null,
            feed.customFolder || null,
            feed.customTags ? JSON.stringify(feed.customTags) : null,
            feed.autoDeleteDuration || 0,
            feed.maxItemsLimit || 25,
            feed.scanInterval || 0,
            feed.iconUrl || null,
            feed.filters ? JSON.stringify(feed.filters) : null
        ]);
    }

    private syncArticlesForFeed(feedUrl: string, items: FeedItem[]): void {
        if (!this.db) return;

        // Get existing article GUIDs for this feed
        const existingGuids = new Set<string>();
        const guidResult = this.db.exec(
            "SELECT guid FROM articles WHERE feed_url = ?", [feedUrl]
        );
        if (guidResult.length > 0) {
            for (const row of guidResult[0].values) {
                existingGuids.add(row[0] as string);
            }
        }

        const currentGuids = new Set(items.map(i => i.guid));

        // Delete articles that no longer exist in this feed
        for (const guid of existingGuids) {
            if (!currentGuids.has(guid)) {
                this.db.run(
                    "DELETE FROM articles WHERE feed_url = ? AND guid = ?",
                    [feedUrl, guid]
                );
            }
        }

        // Upsert articles
        for (const item of items) {
            this.upsertArticle(item);
        }
    }

    upsertArticle(item: FeedItem): void {
        if (!this.db) return;
        this.db.run(`
            INSERT OR REPLACE INTO articles (
                guid, feed_url, title, link, description, content,
                pub_date, author, summary, cover_image, feed_title,
                read, starred, saved, saved_file_path, tags,
                media_type, video_id, video_url, audio_url, duration,
                explicit, image, category, episode_type, season, episode,
                enclosure, itunes, ieee
            ) VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?
            )
        `, [
            item.guid,
            item.feedUrl,
            item.title,
            item.link,
            item.description || '',
            item.content || null,
            item.pubDate,
            item.author || null,
            item.summary || null,
            item.coverImage || '',
            item.feedTitle || '',
            item.read ? 1 : 0,
            item.starred ? 1 : 0,
            item.saved ? 1 : 0,
            item.savedFilePath || null,
            JSON.stringify(item.tags || []),
            item.mediaType || 'article',
            item.videoId || null,
            item.videoUrl || null,
            item.audioUrl || null,
            item.duration || null,
            item.explicit ? 1 : 0,
            item.image || null,
            item.category || null,
            item.episodeType || null,
            item.season ?? null,
            item.episode ?? null,
            item.enclosure ? JSON.stringify(item.enclosure) : null,
            item.itunes ? JSON.stringify(item.itunes) : null,
            item.ieee ? JSON.stringify(item.ieee) : null
        ]);
    }

    loadAllFeeds(): Feed[] {
        if (!this.db) return [];

        const feeds: Feed[] = [];
        const feedResult = this.db.exec(`
            SELECT url, title, folder, last_updated, author, media_type,
                   auto_detect, custom_template, custom_folder, custom_tags,
                   auto_delete_duration, max_items_limit, scan_interval,
                   icon_url, filters
            FROM feeds
        `);

        if (feedResult.length === 0) return [];

        for (const row of feedResult[0].values) {
            const feedUrl = row[0] as string;
            const feed: Feed = {
                url: feedUrl,
                title: row[1] as string,
                folder: row[2] as string,
                lastUpdated: row[3] as number,
                author: row[4] as string | undefined,
                mediaType: (row[5] as Feed['mediaType']) || 'article',
                autoDetect: (row[6] as number) === 1,
                customTemplate: row[7] as string | undefined,
                customFolder: row[8] as string | undefined,
                customTags: row[9] ? JSON.parse(row[9] as string) as string[] : undefined,
                autoDeleteDuration: row[10] as number,
                maxItemsLimit: row[11] as number,
                scanInterval: row[12] as number,
                iconUrl: row[13] as string | undefined,
                filters: row[14] ? JSON.parse(row[14] as string) as Feed['filters'] : undefined,
                items: this.loadArticlesForFeed(feedUrl)
            };
            feeds.push(feed);
        }

        return feeds;
    }

    private loadArticlesForFeed(feedUrl: string): FeedItem[] {
        if (!this.db) return [];

        const result = this.db.exec(`
            SELECT guid, feed_url, title, link, description, content,
                   pub_date, author, summary, cover_image, feed_title,
                   read, starred, saved, saved_file_path, tags,
                   media_type, video_id, video_url, audio_url, duration,
                   explicit, image, category, episode_type, season, episode,
                   enclosure, itunes, ieee
            FROM articles WHERE feed_url = ?
            ORDER BY pub_date DESC
        `, [feedUrl]);

        if (result.length === 0) return [];

        return result[0].values.map(row => this.rowToFeedItem(row));
    }

    private rowToFeedItem(row: SqlValue[]): FeedItem {
        return {
            guid: row[0] as string,
            feedUrl: row[1] as string,
            title: row[2] as string,
            link: row[3] as string,
            description: row[4] as string || '',
            content: row[5] as string | undefined,
            pubDate: row[6] as string,
            author: row[7] as string | undefined,
            summary: row[8] as string | undefined,
            coverImage: row[9] as string || '',
            feedTitle: row[10] as string || '',
            read: (row[11] as number) === 1,
            starred: (row[12] as number) === 1,
            saved: (row[13] as number) === 1,
            savedFilePath: row[14] as string | undefined,
            tags: row[15] ? JSON.parse(row[15] as string) as Tag[] : [],
            mediaType: (row[16] as FeedItem['mediaType']) || undefined,
            videoId: row[17] as string | undefined,
            videoUrl: row[18] as string | undefined,
            audioUrl: row[19] as string | undefined,
            duration: row[20] as string | undefined,
            explicit: (row[21] as number) === 1 ? true : undefined,
            image: row[22] as string | undefined,
            category: row[23] as string | undefined,
            episodeType: row[24] as string | undefined,
            season: row[25] as number | undefined,
            episode: row[26] as number | undefined,
            enclosure: row[27] ? JSON.parse(row[27] as string) as FeedItem['enclosure'] : undefined,
            itunes: row[28] ? JSON.parse(row[28] as string) as FeedItem['itunes'] : undefined,
            ieee: row[29] ? JSON.parse(row[29] as string) as FeedItem['ieee'] : undefined,
        };
    }

    // ─── Folder CRUD ─────────────────────────────────────────

    saveAllFolders(folders: Folder[]): void {
        if (!this.db) return;

        this.db.run("DELETE FROM folders");
        this.insertFolders(folders, null);
    }

    private insertFolders(folders: Folder[], parentId: number | null): void {
        if (!this.db) return;

        for (const folder of folders) {
            this.db.run(`
                INSERT INTO folders (name, parent_id, created_at, modified_at, pinned)
                VALUES (?, ?, ?, ?, ?)
            `, [
                folder.name,
                parentId,
                folder.createdAt || null,
                folder.modifiedAt || null,
                folder.pinned ? 1 : 0
            ]);

            // Get the inserted folder's ID
            const result = this.db.exec("SELECT last_insert_rowid()");
            const insertedId = result[0].values[0][0] as number;

            // Recursively insert subfolders
            if (folder.subfolders && folder.subfolders.length > 0) {
                this.insertFolders(folder.subfolders, insertedId);
            }
        }
    }

    loadAllFolders(): Folder[] {
        if (!this.db) return [];
        return this.loadFoldersByParent(null);
    }

    private loadFoldersByParent(parentId: number | null): Folder[] {
        if (!this.db) return [];

        const query = parentId === null
            ? "SELECT id, name, created_at, modified_at, pinned FROM folders WHERE parent_id IS NULL ORDER BY name"
            : "SELECT id, name, created_at, modified_at, pinned FROM folders WHERE parent_id = ? ORDER BY name";

        const params = parentId === null ? [] : [parentId];
        const result = this.db.exec(query, params);

        if (result.length === 0) return [];

        return result[0].values.map(row => ({
            name: row[1] as string,
            createdAt: row[2] as number | undefined,
            modifiedAt: row[3] as number | undefined,
            pinned: (row[4] as number) === 1 ? true : undefined,
            subfolders: this.loadFoldersByParent(row[0] as number)
        }));
    }

    // ─── Tag CRUD ────────────────────────────────────────────

    saveAllTags(tags: Tag[]): void {
        if (!this.db) return;

        this.db.run("DELETE FROM tags");
        for (const tag of tags) {
            this.db.run(
                "INSERT INTO tags (name, color) VALUES (?, ?)",
                [tag.name, tag.color]
            );
        }
    }

    loadAllTags(): Tag[] {
        if (!this.db) return [];

        const result = this.db.exec("SELECT name, color FROM tags ORDER BY name");
        if (result.length === 0) return [];

        return result[0].values.map(row => ({
            name: row[0] as string,
            color: row[1] as string
        }));
    }

    // ─── Persistence ─────────────────────────────────────────

    async save(): Promise<void> {
        if (!this.db || !this.adapter) return;

        const data = this.db.export();
        const dbPath = `${this.pluginDir}/${DB_FILENAME}`;
        await this.adapter.writeBinary(dbPath, data.buffer as ArrayBuffer);
    }

    scheduleSave(delayMs = 2000): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            void this.save();
            this.saveTimer = null;
        }, delayMs);
    }

    async forceSave(): Promise<void> {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        await this.save();
    }

    close(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
