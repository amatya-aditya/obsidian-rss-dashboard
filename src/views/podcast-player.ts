import { FeedItem } from "../types/types";
import { App, setIcon } from "obsidian";

export class PodcastPlayer {
    private container: HTMLElement;
    private app: App;
    private audioElement: HTMLAudioElement | null = null;
    private currentItem: FeedItem | null = null;
    private playlist: FeedItem[] = [];
    private progressInterval: number | null = null;
    private progressData: Map<string, { position: number, duration: number }> = new Map();
    private currentPlaylistIndex = 0;
    private isShuffled = false;
    private originalPlaylist: FeedItem[] = [];
    
    private playerEl: HTMLElement | null = null;
    private playButton: HTMLElement | null = null;
    private currentTimeEl: HTMLElement | null = null;
    private durationEl: HTMLElement | null = null;
    private progressBarEl: HTMLElement | null = null;
    private progressFilledEl: HTMLElement | null = null;
    private speedButtonEl: HTMLElement | null = null;
    private shuffleButton: HTMLElement | null = null;
    private repeatButton: HTMLElement | null = null;
    private volumeSlider: HTMLElement | null = null;
    private volumeContainer: HTMLElement | null = null;
    
    constructor(container: HTMLElement, app: App, playlist?: FeedItem[]) {
        this.container = container;
        this.app = app;
        if (playlist) {
            this.playlist = playlist;
            this.originalPlaylist = [...playlist];
        }
        this.loadProgressData();
    }
    
    setPlaylist(playlist: FeedItem[]) {
        this.playlist = playlist;
        this.originalPlaylist = [...playlist];
        this.currentPlaylistIndex = 0;
        this.isShuffled = false;
    }
    
    
    loadEpisode(item: FeedItem, fullFeedEpisodes?: FeedItem[]): void {
        
        if (fullFeedEpisodes && Array.isArray(fullFeedEpisodes)) {
            this.setPlaylist(fullFeedEpisodes);
        }
        if (!item.audioUrl) {
            
            return;
        }
        this.currentItem = item;
        this.currentPlaylistIndex = this.playlist.findIndex(ep => ep.guid === item.guid);
        this.render();
        if (this.audioElement) {
            this.audioElement.src = item.audioUrl;
            this.audioElement.load();
            const savedProgress = this.progressData.get(item.guid);
            if (savedProgress && savedProgress.position > 0) {
                this.audioElement.currentTime = savedProgress.position;
                this.updateProgressDisplay();
            }
        }
    }
    
    
    private render(): void {
        if (!this.currentItem) return;
        this.container.empty();
        
        
        
        
        const podcastContainer = this.container.createDiv({ cls: "rss-reader-podcast-container" });
        
        
        const header = podcastContainer.createDiv({ cls: "podcast-player-header" });
        header.createDiv({ cls: "podcast-player-title", text: this.currentItem.title });
        header.createDiv({ cls: "podcast-player-meta", text: `${this.currentItem.feedTitle}${this.currentItem.author ? ' - ' + this.currentItem.author : ''}` });
        
        
        this.playerEl = podcastContainer.createDiv({ cls: "podcast-player-main" });
        
        
        const left = this.playerEl.createDiv({ cls: "podcast-player-left" });
        
        
        const coverImageUrl = this.currentItem.coverImage || this.currentItem.image || this.currentItem.itunes?.image?.href || '';
        
        
        
        if (coverImageUrl) {
            const img = left.createEl("img", {
                cls: "podcast-cover",
                attr: { src: coverImageUrl, alt: this.currentItem.title },
            });
            
            
            img.onerror = () => {
                img.addClass("hidden");
                this.createCoverPlaceholder(left);
            };
        } 
        
        
        const center = this.playerEl.createDiv({ cls: "podcast-player-center" });
        
        
        const seekbarRow = center.createDiv({ cls: "podcast-seekbar-row" });
        this.currentTimeEl = seekbarRow.createDiv({ cls: "current-time", text: "0:00" });
        
        const progressBarWrapper = seekbarRow.createDiv({ cls: "podcast-progress-bar-wrapper" });
        this.progressBarEl = progressBarWrapper.createEl("progress", { cls: "podcast-progress-bar" }) as HTMLProgressElement;
        (this.progressBarEl as HTMLProgressElement).value = 0;
        (this.progressBarEl as HTMLProgressElement).max = 1;
        
        this.progressFilledEl = progressBarWrapper.createDiv({ cls: "podcast-progress-bar-filled" });
        this.durationEl = seekbarRow.createDiv({ cls: "duration", text: "-0:00" });
        
        
        if (this.progressBarEl) {
            const progressBar = this.progressBarEl as HTMLProgressElement;
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
        
        
        const controlsRow = center.createDiv({ cls: "podcast-controls-row" });
        
        
        const leftTools = controlsRow.createDiv({ cls: "podcast-toolbar-left" });
        
        
        this.shuffleButton = leftTools.createEl("button", { cls: "shuffle-btn" });
        setIcon(this.shuffleButton, "shuffle");
        this.shuffleButton.onclick = () => this.toggleShuffle();
        this.updateShuffleButton();
        
        this.speedButtonEl = leftTools.createEl("select", { cls: "speed-control" }) as HTMLSelectElement;
        [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].forEach((v) => {
            const option = this.speedButtonEl?.createEl("option", {
                attr: {
                    value: v.toString()
                },
                text: `${v}×`
            });
            if (option && v === 1) {
                option.selected = true;
            }
        });
        this.speedButtonEl.onchange = () => {
            if (this.audioElement && this.speedButtonEl) {
                this.audioElement.playbackRate = Number((this.speedButtonEl as HTMLSelectElement).value);
            }
        };
        
        if (this.audioElement) {
            this.audioElement.playbackRate = 1;
        }
        
        
        const centerTools = controlsRow.createDiv({ cls: "podcast-toolbar-center" });
        
        const rewindBtn = centerTools.createEl("button", { cls: "rewind" });
        setIcon(rewindBtn, "lucide-skip-back");
        rewindBtn.onclick = () => {
            if (this.audioElement) {
                this.audioElement.currentTime = Math.max(0, this.audioElement.currentTime - 10);
                this.updateProgressDisplay();
            }
        };
        
        this.playButton = centerTools.createEl("button", { cls: "play-pause" });
        setIcon(this.playButton, "play");
        this.playButton.onclick = () => this.togglePlayback();
        
        const forwardBtn = centerTools.createEl("button", { cls: "forward" });
        setIcon(forwardBtn, "lucide-skip-forward");
        forwardBtn.onclick = () => {
            if (this.audioElement) {
                this.audioElement.currentTime = Math.min(
                    this.audioElement.duration,
                    this.audioElement.currentTime + 45
                );
                this.updateProgressDisplay();
            }
        };
        
        
        const rightTools = controlsRow.createDiv({ cls: "podcast-toolbar-right" });
        
        
        this.repeatButton = rightTools.createEl("button", { cls: "repeat-btn" });
        setIcon(this.repeatButton, "repeat");
        this.repeatButton.onclick = () => this.toggleRepeat();
        
        
        this.volumeContainer = rightTools.createDiv({ cls: "volume-control-container" });
        const volumeBtn = this.volumeContainer.createEl("button", { cls: "volume" });
        setIcon(volumeBtn, "volume-2");
        
        this.volumeSlider = this.volumeContainer.createEl("div", { cls: "volume-slider" });
        const volumeBar = this.volumeSlider.createEl("input", { type: "range", cls: "volume-bar" }) as HTMLInputElement;
        volumeBar.min = "0";
        volumeBar.max = "100";
        volumeBar.value = "100";
        volumeBar.oninput = () => {
            if (this.audioElement && volumeBar) {
                this.audioElement.volume = Number((volumeBar as HTMLInputElement).value) / 100;
            }
        };
        
        
        this.audioElement = podcastContainer.createEl("audio", { attr: { preload: "metadata" } }) as HTMLAudioElement;
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

        this.updateProgressDisplay();
        
        
        if (this.playlist && this.playlist.length > 1) {
            const playlistSection = this.container.createDiv({ cls: "podcast-playlist-section" });
            
            
            const playlistHeader = playlistSection.createDiv({ cls: "playlist-header" });
            playlistHeader.createDiv({ cls: "playlist-title", text: `Playlist (${this.playlist.length} episodes)` });
            
            
            const playlistControls = playlistHeader.createDiv({ cls: "playlist-controls" });
            
            const prevBtn = playlistControls.createEl("button", { cls: "playlist-nav-btn" });
            setIcon(prevBtn, "chevron-left");
            prevBtn.onclick = () => this.playPrevious();
            
            const nextBtn = playlistControls.createEl("button", { cls: "playlist-nav-btn" });
            setIcon(nextBtn, "chevron-right");
            nextBtn.onclick = () => this.playNext();
            
            const playlistList = playlistSection.createDiv({ cls: "playlist-list" });
            
            this.playlist.forEach((ep, index) => {
                const epRow = playlistList.createDiv({ cls: "playlist-episode-row" });
                
                
                const progress = this.progressData.get(ep.guid);
                if (progress && progress.position > 0) {
                    epRow.addClass("has-progress");
                    const progressPercent = (progress.position / progress.duration) * 100;
                    epRow.style.setProperty('--progress-width', `${progressPercent}%`);
                }
                
                const playEpBtn = epRow.createEl("button", { cls: "playlist-play-btn" });
                setIcon(playEpBtn, "play");
                playEpBtn.onclick = () => {
                    this.loadEpisode(ep);
                    
                    window.setTimeout(async () => {
                        if (this.audioElement) {
                            try {
                                await this.audioElement.play();
                            } catch (error) {
                                console.error("Failed to play audio:", error);
                            }
                        }
                    }, 100); 
                };
                
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
                epMeta.createDiv({ cls: "playlist-ep-date", text: ep.pubDate ? new Date(ep.pubDate).toLocaleDateString() : "" });
                
                if (ep.duration || ep.itunes?.duration) {
                    const durationBadge = epMeta.createDiv({ cls: "episode-duration-badge" });
                    durationBadge.textContent = ep.duration || ep.itunes?.duration || "";
                }
                
                
                if (progress && progress.position > 0) {
                    const progressIndicator = epRow.createDiv({ cls: "episode-progress-indicator" });
                    const progressPercent = (progress.position / progress.duration) * 100;
                    progressIndicator.style.setProperty('--progress-width', `${progressPercent}%`);
                }
                
                if (this.currentItem && ep.guid === this.currentItem.guid) {
                    epRow.addClass("active");
                }
            });
            
            
        } else {
            
            const emptyState = this.container.createDiv({ cls: "playlist-empty" });
            emptyState.textContent = "No other episodes available in this feed";
        }
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
        this.updateShuffleButton();
        this.render();
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
        this.loadEpisode(nextEpisode);
    }
    
    
    private playPrevious(): void {
        if (this.playlist.length === 0) return;
        
        this.currentPlaylistIndex = this.currentPlaylistIndex === 0 
            ? this.playlist.length - 1 
            : this.currentPlaylistIndex - 1;
        const prevEpisode = this.playlist[this.currentPlaylistIndex];
        this.loadEpisode(prevEpisode);
    }
    
    
    private handleEpisodeEnd(): void {
        this.updatePlayButtonIcon(false);
        
        
        if (this.repeatButton?.classList.contains("active")) {
            if (this.audioElement) {
                this.audioElement.currentTime = 0;
                this.audioElement.play();
            }
        } else {
            
            this.playNext();
        }
    }
    
    
    private togglePlayback(): void {
        if (!this.audioElement) return;
        
        if (this.audioElement.paused) {
            this.audioElement.play();
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
                const progressBar = this.progressBarEl as HTMLProgressElement;
                progressBar.value = this.audioElement.currentTime;
                progressBar.max = this.audioElement.duration;
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
            const data = this.app.loadLocalStorage('rss-podcast-progress');
            if (data) {
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
