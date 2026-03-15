import { FeedItem } from "../types/types";
import { App, setIcon } from "obsidian";
import { MediaService } from "../services/media-service";

export class PodcastPlayer {
    private container: HTMLElement;
    private app: App;
    private theme: string;
    private audioElement: HTMLAudioElement | null = null;
    private currentItem: FeedItem | null = null;
    private hasAudioForCurrentItem = true;
    private playlist: FeedItem[] = [];
    private progressInterval: number | null = null;
    private progressData: Map<string, { position: number, duration: number }> = new Map();
    private currentPlaylistIndex = 0;
    private isShuffled = false;
    private originalPlaylist: FeedItem[] = [];
    private sortOrder: 'recent' | 'oldest' = 'recent';
    private previousVolume = 1;
    private onEpisodeSelected?: (item: FeedItem, source: 'playlist' | 'nav' | 'autoplay' | 'external') => void;

    private playerEl: HTMLElement | null = null;
    private playButton: HTMLButtonElement | null = null;
    private currentTimeEl: HTMLElement | null = null;
    private durationEl: HTMLElement | null = null;
    private progressBarEl: HTMLProgressElement | null = null;
    private progressFilledEl: HTMLElement | null = null;
    private speedButtonEl: HTMLElement | null = null;
    private shuffleButton: HTMLElement | null = null;
    private repeatButton: HTMLElement | null = null;
    private volumeSlider: HTMLElement | null = null;
    private volumeContainer: HTMLElement | null = null;

    constructor(
        container: HTMLElement,
        app: App,
        theme?: string,
        playlist?: FeedItem[],
        onEpisodeSelected?: (item: FeedItem, source: 'playlist' | 'nav' | 'autoplay' | 'external') => void
    ) {
        this.container = container;
        this.app = app;
        this.theme = theme || 'obsidian';
        if (playlist) {
            this.playlist = playlist;
            this.originalPlaylist = [...playlist];
        }
        this.onEpisodeSelected = onEpisodeSelected;
        this.loadProgressData();
    }
    
    setPlaylist(playlist: FeedItem[]) {
        this.playlist = playlist;
        this.originalPlaylist = [...playlist];
        this.currentPlaylistIndex = 0;
        this.isShuffled = false;
    }
    
    
    loadEpisode(
        item: FeedItem,
        fullFeedEpisodes?: FeedItem[],
        options?: {
            notify?: boolean;
            source?: 'playlist' | 'nav' | 'autoplay' | 'external';
            autoplay?: boolean;
        }
    ): void {
        const notify = options?.notify ?? false;
        const source = options?.source ?? 'external';
        const autoplay = options?.autoplay ?? false;
        
        if (fullFeedEpisodes && Array.isArray(fullFeedEpisodes)) {
            this.setPlaylist(fullFeedEpisodes);
        }

        const resolvedAudioUrl =
            item.audioUrl ||
            item.enclosure?.url ||
            MediaService.extractPodcastAudio(item.description);
        if (resolvedAudioUrl) {
            item.audioUrl = resolvedAudioUrl;
        }

        this.currentItem = item;
        this.hasAudioForCurrentItem = !!resolvedAudioUrl;
        this.currentPlaylistIndex = this.playlist.findIndex(ep => ep.guid === item.guid);

        if (notify && this.onEpisodeSelected) {
            this.onEpisodeSelected(item, source);
        }

        this.render();
        if (this.audioElement) {
            if (item.audioUrl) {
                this.audioElement.src = item.audioUrl;
                this.audioElement.load();
                const savedProgress = this.progressData.get(item.guid);
                if (savedProgress && savedProgress.position > 0) {
                    this.audioElement.currentTime = savedProgress.position;
                    this.updateProgressDisplay();
                }

                if (autoplay) {
                    this.updatePlayButtonIcon(true);
                    void this.audioElement.play().catch((error) => {
                        this.updatePlayButtonIcon(false);
                        console.error("Failed to play audio:", error);
                    });
                }
            } else {
                this.audioElement.pause();
                this.audioElement.src = "";
                this.audioElement.load();
            }
        }
    }
     
    refreshTags(): void {
        if (!this.currentItem) return;
        const infoSection = this.container.querySelector<HTMLElement>(".podcast-info-section");
        if (!infoSection) return;

        infoSection.querySelectorAll(".podcast-tag-strip").forEach((el) => el.remove());
        this.renderTagStrip(infoSection, this.currentItem.tags);
    }

    private renderTagStrip(infoSection: HTMLElement, tags: Array<{ name: string; color?: string }> | undefined): void {
        if (!tags || tags.length === 0) {
            return;
        }
        const tagsStrip = infoSection.createDiv({ cls: "podcast-tag-strip" });
        const maxVisibleTags = 3;
        const tagsToShow = tags.slice(0, maxVisibleTags);
        const remainingCount = tags.length - maxVisibleTags;
        const remainingTags = remainingCount > 0 ? tags.slice(maxVisibleTags) : [];

        tagsToShow.forEach(tag => {
            const tagEl = tagsStrip.createDiv({ cls: "podcast-tag", text: tag.name });
            if (tag.color) {
                tagEl.style.backgroundColor = tag.color;
            }
        });

        if (remainingCount > 0) {
            const overflowTitle = remainingTags.map(t => t.name).join("\n");
            tagsStrip.createDiv({
                cls: "podcast-tag podcast-tag-more",
                text: `+${remainingCount} more`,
                attr: { title: overflowTitle, "aria-label": overflowTitle }
            });
        }
    }
     
    private render(): void {
        if (!this.currentItem) return;
        const playlistEl = this.container.querySelector('.playlist-list');
        const savedScrollTop = playlistEl ? playlistEl.scrollTop : 0;
        this.container.empty();
        
        const podcastContainer = this.container.createDiv({ cls: "rss-reader-podcast-container" });
        podcastContainer.setAttribute("data-podcast-theme", this.theme);
        
        // Initialize audio element early so UI components can reference its state
        this.audioElement = podcastContainer.createEl("audio", { attr: { preload: "metadata" } });
        if (this.currentItem.audioUrl) {
            this.audioElement.src = this.currentItem.audioUrl;
        }
        this.audioElement.onplay = () => this.updatePlayButtonIcon(true);
        this.audioElement.onpause = () => this.updatePlayButtonIcon(false);
        this.audioElement.ontimeupdate = () => this.updateProgressDisplay();
        this.audioElement.onloadedmetadata = () => this.updateProgressDisplay();
        this.audioElement.onended = () => this.handleEpisodeEnd();
        this.audioElement.volume = 1;
        this.audioElement.playbackRate = 1;

        // --- NEW TWO-ROW LAYOUT STRUCTURE ---
        this.playerEl = podcastContainer.createDiv({ cls: "podcast-player-main-layout" });
        
        // ROW 1: Info, Controls, and Tools
        const mainControlsRow = this.playerEl.createDiv({ cls: "podcast-main-controls-row" });
        
        // 1.1 Left: Thumbnail & Info
        const infoSection = mainControlsRow.createDiv({ cls: "podcast-info-section" });
        
        const coverImageUrl = this.currentItem.coverImage || this.currentItem.image || this.currentItem.itunes?.image?.href || '';
        const coverWrapper = infoSection.createDiv({ cls: "podcast-cover-wrapper" });
        
        if (coverImageUrl) {
            const img = coverWrapper.createEl("img", {
                cls: "podcast-cover",
                attr: { src: coverImageUrl, alt: this.currentItem.title },
            });
            img.onerror = () => {
                img.addClass("hidden");
                this.createCoverPlaceholder(coverWrapper);
            };
        } else {
            this.createCoverPlaceholder(coverWrapper);
        }

        const textInfo = infoSection.createDiv({ cls: "podcast-text-info" });
        textInfo.createDiv({ cls: "podcast-title-display", text: this.currentItem.title });
        textInfo.createDiv({ cls: "podcast-meta-display", text: `${this.currentItem.feedTitle}${this.currentItem.author ? ' - ' + this.currentItem.author : ''}` });
        
        // 1.1.5 Tags Section
        this.renderTagStrip(infoSection, this.currentItem.tags);

        // 1.2 Center: Transport Controls
        const transportSection = mainControlsRow.createDiv({ cls: "podcast-transport-section" });
        
        this.shuffleButton = transportSection.createEl("button", { cls: "rss-shuffle-btn" });
        setIcon(this.shuffleButton, "shuffle");
        this.shuffleButton.onclick = () => this.toggleShuffle();
        this.updateShuffleButton();

        const rewindBtn = transportSection.createEl("button", { cls: "rss-rewind" });
        setIcon(rewindBtn, "rotate-ccw");
        rewindBtn.createSpan({ cls: "seek-label", text: "30" });
        rewindBtn.onclick = () => {
            if (this.audioElement) {
                this.audioElement.currentTime = Math.max(0, this.audioElement.currentTime - 30);
                this.updateProgressDisplay();
            }
        };
        
        this.playButton = transportSection.createEl("button", { cls: "rss-play-pause" });
        setIcon(this.playButton, "play");
        this.playButton.onclick = () => this.togglePlayback();
        this.playButton.disabled = !this.hasAudioForCurrentItem;

        if (!this.hasAudioForCurrentItem) {
            const errorText = "Audio url not found. Cannot play this podcast.";
            podcastContainer.createDiv({ cls: "podcast-player-error", text: errorText });
        }
        
        const forwardBtn = transportSection.createEl("button", { cls: "rss-forward" });
        setIcon(forwardBtn, "rotate-cw");
        forwardBtn.createSpan({ cls: "seek-label", text: "30" });
        forwardBtn.onclick = () => {
            if (this.audioElement) {
                this.audioElement.currentTime = Math.min(
                    this.audioElement.duration || Infinity,
                    this.audioElement.currentTime + 30
                );
                this.updateProgressDisplay();
            }
        };

        this.repeatButton = transportSection.createEl("button", { cls: "rss-repeat-btn" });
        setIcon(this.repeatButton, "repeat");
        this.repeatButton.onclick = () => this.toggleRepeat();

        // 1.3 Right: Tools (Speed & Volume)
        const toolsSection = mainControlsRow.createDiv({ cls: "podcast-tools-section" });
        
        this.speedButtonEl = toolsSection.createEl("select", { cls: "rss-speed-control" });
        [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].forEach((v) => {
            const option = this.speedButtonEl?.createEl("option", {
                attr: { value: v.toString() },
                text: `${v}\u00D7`
            });
            if (option && v === 1) option.selected = true;
        });
        this.speedButtonEl.onchange = () => {
            if (this.audioElement && this.speedButtonEl) {
                this.audioElement.playbackRate = Number((this.speedButtonEl as HTMLSelectElement).value);
            }
        };
        
        this.volumeContainer = toolsSection.createDiv({ cls: "rss-volume-control-container" });
        const volumeBtn = this.volumeContainer.createEl("button", { cls: "rss-volume" });
        const updateVolumeIcon = () => {
            if (!this.audioElement) return;
            if (this.audioElement.muted || this.audioElement.volume === 0) {
                setIcon(volumeBtn, "volume-x");
                volumeBtn.addClass("is-muted");
                if (volumeBar) volumeBar.value = "0";
            } else {
                if (this.audioElement.volume < 0.5) {
                    setIcon(volumeBtn, "volume-1");
                } else {
                    setIcon(volumeBtn, "volume-2");
                }
                volumeBtn.removeClass("is-muted");
                if (volumeBar) volumeBar.value = (this.audioElement.volume * 100).toString();
            }
        };
        
        volumeBtn.onclick = () => {
            if (this.audioElement) {
                if (!this.audioElement.muted && this.audioElement.volume > 0) {
                    this.previousVolume = this.audioElement.volume;
                    this.audioElement.muted = true;
                } else {
                    this.audioElement.muted = false;
                    if (this.audioElement.volume === 0) {
                        this.audioElement.volume = this.previousVolume || 1;
                    }
                }
                updateVolumeIcon();
            }
        };
        
        this.volumeSlider = this.volumeContainer.createDiv({ cls: "rss-volume-slider" });
        const volumeBar = this.volumeSlider.createEl("input", { type: "range", cls: "rss-volume-bar" });
        volumeBar.min = "0";
        volumeBar.max = "100";
        volumeBar.value = (this.audioElement ? this.audioElement.volume * 100 : 100).toString();
        volumeBar.oninput = () => {
            if (this.audioElement && volumeBar) {
                this.audioElement.volume = Number(volumeBar.value) / 100;
                if (this.audioElement.volume > 0) {
                    this.audioElement.muted = false;
                    this.previousVolume = this.audioElement.volume;
                }
                updateVolumeIcon();
            }
        };
        
        updateVolumeIcon();

        // ROW 2: Progress Area
        const progressArea = this.playerEl.createDiv({ cls: "podcast-progress-area" });
        
        const seekbarRow = progressArea.createDiv({ cls: "podcast-seekbar-row" });
        this.currentTimeEl = seekbarRow.createDiv({ cls: "rss-current-time", text: "0:00" });
        
        const progressBarWrapper = seekbarRow.createDiv({ cls: "podcast-progress-bar-wrapper" });
        this.progressBarEl = progressBarWrapper.createEl("progress", { cls: "podcast-progress-bar" });
        this.progressBarEl.value = 0;
        this.progressBarEl.max = 1;
        
        this.progressFilledEl = progressBarWrapper.createDiv({ cls: "podcast-progress-bar-filled" });
        this.durationEl = seekbarRow.createDiv({ cls: "rss-duration", text: "-0:00" });
        
        if (this.progressBarEl) {
            const progressBar = this.progressBarEl;
            let isDragging = false;

            const getSeekTime = (e: MouseEvent | TouchEvent) => {
                const rect = progressBar.getBoundingClientRect();
                let clientX: number;
                if (e instanceof MouseEvent) {
                    clientX = e.clientX;
                } else {
                    clientX = e.touches[0].clientX;
                }
                const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                if (this.audioElement && this.audioElement.duration) {
                    return percent * this.audioElement.duration;
                }
                return 0;
            };

            progressBar.addEventListener('click', (e) => {
                if (!this.audioElement || !this.audioElement.duration) return;
                const seekTime = getSeekTime(e);
                this.audioElement.currentTime = seekTime;
                this.updateProgressDisplay();
            });

            progressBar.addEventListener('mousedown', (e) => {
                if (!this.audioElement || !this.audioElement.duration) return;
                isDragging = true;
                const moveHandler = (moveEvent: MouseEvent) => {
                    if (!isDragging || !this.audioElement || !this.audioElement.duration) return;
                    const seekTime = getSeekTime(moveEvent);
                    this.audioElement.currentTime = seekTime;
                    this.updateProgressDisplay();
                };
                const upHandler = () => {
                    isDragging = false;
                    window.removeEventListener('mousemove', moveHandler);
                    window.removeEventListener('mouseup', upHandler);
                };
                window.addEventListener('mousemove', moveHandler);
                window.addEventListener('mouseup', upHandler);
            });

            progressBar.addEventListener('touchstart', (e) => {
                if (!this.audioElement || !this.audioElement.duration) return;
                isDragging = true;
                const moveHandler = (moveEvent: TouchEvent) => {
                    if (!isDragging || !this.audioElement || !this.audioElement.duration) return;
                    const seekTime = getSeekTime(moveEvent);
                    this.audioElement.currentTime = seekTime;
                    this.updateProgressDisplay();
                };
                const upHandler = () => {
                    isDragging = false;
                    window.removeEventListener('touchmove', moveHandler);
                    window.removeEventListener('touchend', upHandler);
                };
                window.addEventListener('touchmove', moveHandler);
                window.addEventListener('touchend', upHandler);
            });
        }
        
        this.updateProgressDisplay();
         
        if (this.playlist && this.playlist.length > 1) {
            const playlistSection = this.container.createDiv({ cls: "podcast-playlist-section" });
            playlistSection.setAttribute("data-podcast-theme", this.theme);
            
            
            const playlistHeader = playlistSection.createDiv({ cls: "playlist-header" });
            playlistHeader.createDiv({ cls: "playlist-title", text: `Playlist (${this.playlist.length} episodes)` });
            
            const sortControls = playlistHeader.createDiv({ cls: "playlist-sort-controls" });
            
            const recentBtn = sortControls.createEl("button", { 
                cls: "playlist-sort-btn",
                text: "Recent"
            });
            if (this.sortOrder === 'recent') recentBtn.addClass("active-sort");
            recentBtn.onclick = () => this.sortPlaylist('recent');
            
            const oldestBtn = sortControls.createEl("button", { 
                cls: "playlist-sort-btn",
                text: "Oldest"
            });
            if (this.sortOrder === 'oldest') oldestBtn.addClass("active-sort");
            oldestBtn.onclick = () => this.sortPlaylist('oldest');
            
            const playlistList = playlistSection.createDiv({ cls: "playlist-list" });
            
            this.playlist.forEach((ep, index) => {
                const epRow = playlistList.createDiv({ cls: "playlist-episode-row" });
                epRow.setAttribute("data-episode-guid", ep.guid);
                 
                // Click to play the episode
                epRow.onclick = () => {
                    // Switching episodes via playlist should not auto-play; user must hit play.
                    this.loadEpisode(ep, undefined, { notify: true, source: 'playlist' });
                };
                
                const progress = this.progressData.get(ep.guid);
                if (progress && progress.position > 0) {
                    epRow.addClass("has-progress");
                    const progressPercent = (progress.position / progress.duration) * 100;
                    epRow.style.setProperty('--progress-width', `${progressPercent}%`);
                }
                
                const playlistCoverImage = ep.coverImage || ep.image || ep.itunes?.image?.href || (this.currentItem?.coverImage || this.currentItem?.image || this.currentItem?.itunes?.image?.href) || '';
                if (playlistCoverImage) {
                    const img = epRow.createEl("img", { cls: "playlist-ep-cover", attr: { src: playlistCoverImage, alt: ep.title } });
                    img.onerror = () => {
                        img.addClass("hidden");
                        const placeholder = epRow.createDiv({ cls: "playlist-ep-cover-placeholder" });
                        placeholder.textContent = '🎧';
                    };
                } else {
                    const placeholder = epRow.createDiv({ cls: "playlist-ep-cover-placeholder" });
                    placeholder.textContent = '🎧';
                }
                
                const epInfo = epRow.createDiv({ cls: "playlist-ep-info" });
                epInfo.createDiv({ cls: "playlist-ep-title", text: ep.title });
                
                const epMeta = epInfo.createDiv({ cls: "playlist-ep-meta" });
                const epMetaLeft = epMeta.createDiv({ cls: "playlist-ep-meta-left" });
                epMetaLeft.createDiv({ cls: "playlist-ep-date", text: ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : "" });
                
                if (ep.duration || ep.itunes?.duration) {
                    const durationBadge = epMetaLeft.createDiv({ cls: "episode-duration-badge" });
                    durationBadge.textContent = ep.duration || ep.itunes?.duration || "";
                }

                this.renderPlaylistTags(epMeta, ep.tags);
                 
                if (progress && progress.position > 0) {
                    const progressIndicator = epRow.createDiv({ cls: "episode-progress-indicator" });
                    const progressPercent = (progress.position / progress.duration) * 100;
                    progressIndicator.style.setProperty('--progress-width', `${progressPercent}%`);
                }
                
                if (this.currentItem && ep.guid === this.currentItem.guid) {
                    epRow.addClass("active");
                }
            });

            if (savedScrollTop > 0) {
                playlistList.scrollTop = savedScrollTop;
            }

        } else {
            
            const emptyState = this.container.createDiv({ cls: "playlist-empty" });
            emptyState.textContent = "No other episodes available in this feed";
        }
    }

    refreshPlaylistTags(episodeGuid?: string): void {
        const playlistSection = this.container.querySelector<HTMLElement>(".podcast-playlist-section");
        if (!playlistSection) return;

        const rows = Array.from(
            playlistSection.querySelectorAll<HTMLElement>(".playlist-episode-row[data-episode-guid]")
        ).filter((row) => {
            if (!episodeGuid) return true;
            return row.getAttribute("data-episode-guid") === episodeGuid;
        });

        for (const row of rows) {
            const guid = row.getAttribute("data-episode-guid");
            if (!guid) continue;
            const episode = this.playlist.find((ep) => ep.guid === guid);
            if (!episode) continue;

            const epMeta = row.querySelector<HTMLElement>(".playlist-ep-meta");
            if (!epMeta) continue;

            const existing = epMeta.querySelector<HTMLElement>(".playlist-ep-meta-tags");
            if (existing) {
                existing.remove();
            }
            this.renderPlaylistTags(epMeta, episode.tags);
        }
    }

    private renderPlaylistTags(epMeta: HTMLElement, tags: Array<{ name: string; color?: string }> | undefined): void {
        if (!tags || tags.length === 0) return;

        const tagsWrap = epMeta.createDiv({ cls: "playlist-ep-meta-tags" });
        const maxVisibleTags = 3;
        const tagsToShow = tags.slice(0, maxVisibleTags);
        const remainingCount = tags.length - maxVisibleTags;
        const remainingTags = remainingCount > 0 ? tags.slice(maxVisibleTags) : [];

        tagsToShow.forEach(tag => {
            const tagEl = tagsWrap.createDiv({ cls: "playlist-ep-tag", text: tag.name });
            if (tag.color) {
                tagEl.style.backgroundColor = tag.color;
            }
        });

        if (remainingCount > 0) {
            const overflowTitle = remainingTags.map(t => t.name).join("\n");
            tagsWrap.createDiv({
                cls: "playlist-ep-tag playlist-ep-tag-more",
                text: `+${remainingCount}`,
                attr: { title: overflowTitle, "aria-label": overflowTitle }
            });
        }
    }

    private replacePlaylistSection(): void {
        const playlistEl = this.container.querySelector<HTMLElement>(".playlist-list");
        const savedScrollTop = playlistEl ? playlistEl.scrollTop : 0;

        this.container.querySelectorAll(".podcast-playlist-section, .playlist-empty").forEach((el) => el.remove());

        if (this.playlist && this.playlist.length > 1) {
            const playlistSection = this.container.createDiv({ cls: "podcast-playlist-section" });
            playlistSection.setAttribute("data-podcast-theme", this.theme);

            const playlistHeader = playlistSection.createDiv({ cls: "playlist-header" });
            playlistHeader.createDiv({ cls: "playlist-title", text: `Playlist (${this.playlist.length} episodes)` });

            const sortControls = playlistHeader.createDiv({ cls: "playlist-sort-controls" });

            const recentBtn = sortControls.createEl("button", {
                cls: "playlist-sort-btn",
                text: "Recent"
            });
            if (this.sortOrder === 'recent') recentBtn.addClass("active-sort");
            recentBtn.onclick = () => this.sortPlaylist('recent');

            const oldestBtn = sortControls.createEl("button", {
                cls: "playlist-sort-btn",
                text: "Oldest"
            });
            if (this.sortOrder === 'oldest') oldestBtn.addClass("active-sort");
            oldestBtn.onclick = () => this.sortPlaylist('oldest');

            const playlistList = playlistSection.createDiv({ cls: "playlist-list" });

            this.playlist.forEach((ep) => {
                const epRow = playlistList.createDiv({ cls: "playlist-episode-row" });
                epRow.setAttribute("data-episode-guid", ep.guid);

                epRow.onclick = () => {
                    this.loadEpisode(ep, undefined, { notify: true, source: 'playlist', autoplay: true });
                };

                const progress = this.progressData.get(ep.guid);
                if (progress && progress.position > 0) {
                    epRow.addClass("has-progress");
                    const progressPercent = (progress.position / progress.duration) * 100;
                    epRow.style.setProperty('--progress-width', `${progressPercent}%`);
                }

                const playlistCoverImage = ep.coverImage || ep.image || ep.itunes?.image?.href || (this.currentItem?.coverImage || this.currentItem?.image || this.currentItem?.itunes?.image?.href) || '';
                if (playlistCoverImage) {
                    const img = epRow.createEl("img", { cls: "playlist-ep-cover", attr: { src: playlistCoverImage, alt: ep.title } });
                    img.onerror = () => {
                        img.addClass("hidden");
                        const placeholder = epRow.createDiv({ cls: "playlist-ep-cover-placeholder" });
                        placeholder.textContent = 'ðŸŽ§';
                    };
                } else {
                    const placeholder = epRow.createDiv({ cls: "playlist-ep-cover-placeholder" });
                    placeholder.textContent = 'ðŸŽ§';
                }

                const epInfo = epRow.createDiv({ cls: "playlist-ep-info" });
                epInfo.createDiv({ cls: "playlist-ep-title", text: ep.title });

                const epMeta = epInfo.createDiv({ cls: "playlist-ep-meta" });
                const epMetaLeft = epMeta.createDiv({ cls: "playlist-ep-meta-left" });
                epMetaLeft.createDiv({ cls: "playlist-ep-date", text: ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : "" });

                if (ep.duration || ep.itunes?.duration) {
                    const durationBadge = epMetaLeft.createDiv({ cls: "episode-duration-badge" });
                    durationBadge.textContent = ep.duration || ep.itunes?.duration || "";
                }

                this.renderPlaylistTags(epMeta, ep.tags);

                if (progress && progress.position > 0) {
                    const progressIndicator = epRow.createDiv({ cls: "episode-progress-indicator" });
                    const progressPercent = (progress.position / progress.duration) * 100;
                    progressIndicator.style.setProperty('--progress-width', `${progressPercent}%`);
                }

                if (this.currentItem && ep.guid === this.currentItem.guid) {
                    epRow.addClass("active");
                }
            });

            if (savedScrollTop > 0) {
                playlistList.scrollTop = savedScrollTop;
            }

            return;
        }

        const emptyState = this.container.createDiv({ cls: "playlist-empty" });
        emptyState.textContent = "No other episodes available in this feed";
    }
    
    
    private createCoverPlaceholder(container: HTMLElement): void {
        const placeholder = container.createDiv({ cls: "podcast-cover-placeholder" });
        placeholder.textContent = '🎧';
    }
    
    
    private toggleShuffle(): void {
        this.isShuffled = !this.isShuffled;
        if (this.isShuffled) {
            this.playlist = [...this.originalPlaylist].sort(() => Math.random() - 0.5);
        } else {
            this.playlist = [...this.originalPlaylist];
        }
        if (this.currentItem) {
            this.currentPlaylistIndex = this.playlist.findIndex(ep => ep.guid === this.currentItem?.guid);
        }
        this.updateShuffleButton();
        this.replacePlaylistSection();
    }
    
    private sortPlaylist(order: 'recent' | 'oldest'): void {
        this.sortOrder = order;
        
        // Sorting logic: if recent, newest first. If oldest, oldest first.
        this.playlist.sort((a, b) => {
            const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
            const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
            
            if (this.sortOrder === 'recent') {
                return dateB - dateA; // Descending
            } else {
                return dateA - dateB; // Ascending
            }
        });
        
        // Also update the original playlist so shuffle uses the new base order if toggled off
        this.originalPlaylist = [...this.playlist];

        if (this.currentItem) {
            this.currentPlaylistIndex = this.playlist.findIndex(ep => ep.guid === this.currentItem?.guid);
        }

        this.replacePlaylistSection();
    }
    
    
    private updateShuffleButton(): void {
        if (this.shuffleButton) {
            this.shuffleButton.classList.toggle("active", this.isShuffled);
        }
    }
    
    
    private toggleRepeat(): void {
        if (this.repeatButton) {
            this.repeatButton.classList.toggle("active");
        }
    }
    
    
    private playNext(): void {
        if (this.playlist.length === 0) return;
        
        this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % this.playlist.length;
        const nextEpisode = this.playlist[this.currentPlaylistIndex];
        this.loadEpisode(nextEpisode, undefined, { notify: true, source: 'nav' });
    }
    
    
    private playPrevious(): void {
        if (this.playlist.length === 0) return;
        
        this.currentPlaylistIndex = this.currentPlaylistIndex === 0 
            ? this.playlist.length - 1 
            : this.currentPlaylistIndex - 1;
        const prevEpisode = this.playlist[this.currentPlaylistIndex];
        this.loadEpisode(prevEpisode, undefined, { notify: true, source: 'nav' });
    }
    
    
    private handleEpisodeEnd(): void {
        this.updatePlayButtonIcon(false);
         
         
        if (this.repeatButton?.classList.contains("active")) {
            if (this.audioElement) {
                this.audioElement.currentTime = 0;
                this.updatePlayButtonIcon(true);
                void this.audioElement.play().catch((error) => {
                    this.updatePlayButtonIcon(false);
                    console.error("Failed to play audio:", error);
                });
            }
        } else {
              
            if (this.playlist.length === 0) return;
            this.currentPlaylistIndex = (this.currentPlaylistIndex + 1) % this.playlist.length;
            const nextEpisode = this.playlist[this.currentPlaylistIndex];
            this.loadEpisode(nextEpisode, undefined, { notify: true, source: 'autoplay', autoplay: true });
        }
    }
    
    
    private togglePlayback(): void {
        if (!this.audioElement) return;
        if (!this.currentItem?.audioUrl) return;
        
        if (this.audioElement.paused) {
            void this.audioElement.play();
        } else {
            this.audioElement.pause();
        }
    }
    
    
    private cyclePlaybackSpeed(): void {
        if (!this.audioElement || !this.speedButtonEl) return;
        
        const speeds = [1.0, 1.25, 1.5, 1.75, 2.0, 0.75];
        const currentSpeed = this.audioElement.playbackRate;
        
        let nextIndex = speeds.findIndex(speed => speed === currentSpeed) + 1;
        if (nextIndex >= speeds.length) nextIndex = 0;
        
        this.audioElement.playbackRate = speeds[nextIndex];
        this.speedButtonEl.textContent = `${speeds[nextIndex].toFixed(2)}x`;
    }
    
    
    private startProgressTracking(): void {
        if (this.progressInterval) {
            window.clearInterval(this.progressInterval);
        }
        
        this.progressInterval = window.setInterval(() => {
            this.updateProgressDisplay();
            
            if (this.audioElement && this.currentItem) {
                this.saveProgress();
            }
        }, 1000);
    }
    
    
    private stopProgressTracking(): void {
        if (this.progressInterval) {
            window.clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
    
    
    private updateProgressDisplay(): void {
        if (!this.audioElement) return;
        const currentTime = this.formatTime(this.audioElement.currentTime);
        if (this.currentTimeEl) {
            this.currentTimeEl.textContent = currentTime;
        }
        if (this.audioElement.duration && !isNaN(this.audioElement.duration)) {
            const duration = this.formatTime(this.audioElement.duration);
            if (this.durationEl) {
                this.durationEl.textContent = duration;
            }
            
            if (this.progressBarEl) {
                this.progressBarEl.value = this.audioElement.currentTime;
                this.progressBarEl.max = this.audioElement.duration;
            }
            
            if (this.progressFilledEl) {
                const percent = (this.audioElement.currentTime / this.audioElement.duration) * 100;
                this.progressFilledEl.style.setProperty('--progress-percent', `${percent}%`);
            }
        }
    }
    
    
    private formatTime(seconds: number): string {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    
    private updatePlayButtonIcon(isPlaying: boolean): void {
        if (!this.playButton) return;
        
        setIcon(this.playButton, isPlaying ? "pause" : "play");
    }
    
    
    private saveProgress(): void {
        if (!this.audioElement || !this.currentItem) return;
        
        
        if (this.audioElement.currentTime < 3) return;
        
        
        if (this.audioElement.duration && 
            this.audioElement.currentTime > this.audioElement.duration - 3) {
            return;
        }
        
        this.progressData.set(this.currentItem.guid, {
            position: this.audioElement.currentTime,
            duration: this.audioElement.duration || 0
        });
        
        this.saveProgressData();
    }
    
    
    private saveProgressData(): void {
        try {
            const data: Record<string, { position: number, duration: number }> = {};
            this.progressData.forEach((value, key) => {
                data[key] = value;
            });
            this.app.saveLocalStorage('rss-podcast-progress', data);
        } catch (error) {
            console.error("Failed to save podcast progress:", error);
        }
    }
    
    
    private loadProgressData(): void {
        try {
            const data: unknown = this.app.loadLocalStorage('rss-podcast-progress');
            if (data && typeof data === 'object') {
                const parsed = data as Record<string, { position: number, duration: number }>;
                
                this.progressData.clear();
                Object.entries(parsed).forEach(([key, value]) => {
                    this.progressData.set(key, value);
                });
            }
        } catch (error) {
            console.error("Failed to load podcast progress:", error);
        }
    }
    
    
    updateTheme(theme: string): void {
        this.theme = theme;
        const themedElements = this.container.querySelectorAll('[data-podcast-theme]');
        themedElements.forEach(el => {
            el.setAttribute('data-podcast-theme', theme);
        });
    }

    destroy(): void {
        this.stopProgressTracking();
        
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = "";
            this.audioElement.remove();
            this.audioElement = null;
        }
        
        this.saveProgressData();
    }
}
