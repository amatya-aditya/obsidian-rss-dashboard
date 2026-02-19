import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { FeedMetadata } from "../types/discover-types";
import { FolderSuggest } from "../components/folder-suggest";

/**
 * Modal for selecting a folder to add a feed to
 */
export class AddToFolderModal extends Modal {
	private plugin: RssDashboardPlugin;
	private feed: FeedMetadata;
	private onAdded: () => void;

	constructor(
		app: App,
		plugin: RssDashboardPlugin,
		feed: FeedMetadata,
		onAdded: () => void,
	) {
		super(app);
		this.plugin = plugin;
		this.feed = feed;
		this.onAdded = onAdded;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClasses([
			"rss-dashboard-modal",
			"rss-dashboard-modal-container",
		]);
		contentEl.empty();

		// Header
		new Setting(contentEl)
			.setName(`Add "${this.feed.title}" to folder`)
			.setHeading();

		// Folder input
		let selectedFolder = "Uncategorized";
		let folderInput: HTMLInputElement;

		new Setting(contentEl)
			.setName("Folder")
			.setDesc("Select an existing folder or type a new folder name")
			.addText((text) => {
				text.setValue(selectedFolder).setPlaceholder(
					"Type or select folder...",
				);
				folderInput = text.inputEl;
				folderInput.autocomplete = "off";
				folderInput.spellcheck = false;

				// Add folder suggest
				new FolderSuggest(
					this.app,
					folderInput,
					this.plugin.settings.folders,
				);

				// Update selected folder on change
				text.onChange((value) => {
					selectedFolder = value;
				});
			});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "rss-dashboard-modal-buttons",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelButton.onclick = () => this.close();

		const addButton = buttonContainer.createEl("button", {
			text: "Add to folder",
			cls: "rss-dashboard-primary-button",
		});
		addButton.onclick = () => {
			void this.addFeedToFolder(selectedFolder);
		};

		// Focus the folder input
		window.setTimeout(() => {
			folderInput?.focus();
			folderInput?.select();
		}, 0);
	}

	/**
	 * Add the feed to the specified folder, creating the folder if needed
	 */
	private async addFeedToFolder(folderName: string): Promise<void> {
		try {
			// Ensure folder exists
			await this.ensureFolderExists(folderName);

			// Add the feed
			await this.plugin.addFeed(
				this.feed.title,
				this.feed.url,
				folderName,
			);

			new Notice(`Feed "${this.feed.title}" added to "${folderName}"`);
			this.close();
			this.onAdded();
		} catch (error) {
			new Notice(
				`Failed to add feed: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Ensure a folder exists, creating it if needed
	 */
	private async ensureFolderExists(folderName: string): Promise<void> {
		if (!folderName || folderName.trim() === "") {
			folderName = "Uncategorized";
		}

		const folderExists = this.plugin.settings.folders.some(
			(f) => f.name.toLowerCase() === folderName.toLowerCase(),
		);

		if (!folderExists) {
			await this.plugin.ensureFolderExists(folderName);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
