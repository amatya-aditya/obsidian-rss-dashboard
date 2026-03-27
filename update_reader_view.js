const fs = require('fs');
const path = require('path');

const targetFile = 'c:\\Obsidian\\Obsidian_Main\\.obsidian\\plugins\\obsidian-rss-dashboard\\src\\views\\reader-view.ts';
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Update saveButton variable to this.saveToggleButton
content = content.replace(
  'const saveButton = actions.createDiv({\r\n      cls: "rss-reader-action-button",\r\n      attr: { title: "Save article" },\r\n    });\r\n\r\n    setIcon(saveButton, "save");\r\n    saveButton.addEventListener("click", (e) => {\r\n      if (this.currentItem) {\r\n        this.showSaveOptions(e, this.currentItem);\r\n      }\r\n    });',
  'this.saveToggleButton = actions.createDiv({\r\n      cls: "rss-reader-action-button",\r\n      attr: { title: "Save article" },\r\n    });\r\n\r\n    setIcon(this.saveToggleButton, "save");\r\n    this.saveToggleButton.addEventListener("click", (e) => {\r\n      if (this.currentItem) {\r\n        if (this.currentItem.saved) {\r\n          this.openSavedFile(this.currentItem);\r\n        } else {\r\n          this.showSaveOptions(e, this.currentItem);\r\n        }\r\n      }\r\n    });'
);

// Fallback search without explicit CRLF if the above misses
if (!content.includes('this.saveToggleButton = actions.createDiv')) {
  content = content.replace(
    /const saveButton = actions\.createDiv\(\{[\s\S]*?saveButton\.addEventListener\("click", \(e\) => \{[\s\S]*?this\.showSaveOptions\(e, this\.currentItem\);\s*\}\s*\}\);\s*\}\);/,
    `this.saveToggleButton = actions.createDiv({
      cls: "rss-reader-action-button",
      attr: { title: "Save article" },
    });

    setIcon(this.saveToggleButton, "save");
    this.saveToggleButton.addEventListener("click", (e) => {
      if (this.currentItem) {
        if (this.currentItem.saved) {
          this.openSavedFile(this.currentItem);
        } else {
          this.showSaveOptions(e, this.currentItem);
        }
      }
    });`
  );
}

// 2. Add 'View saved note' option to menu
content = content.replace(
  /private showSaveOptions\(event: MouseEvent, item: FeedItem\): void \{\s*const menu = new Menu\(\);\s*menu\.addItem\(\(menuItem: MenuItem\) => \{/g,
  `private showSaveOptions(event: MouseEvent, item: FeedItem): void {
    const menu = new Menu();

    if (item.saved) {
      menu.addItem((menuItem: MenuItem) => {
        menuItem
          .setTitle("View saved note")
          .setIcon("file-text")
          .onClick(() => {
            this.openSavedFile(item);
          });
      });
    }

    menu.addItem((menuItem: MenuItem) => {`
);

// 3. Update updateToggleButtons and add helper methods
const toggleButtonFindStr = `  private updateToggleButtons(): void {
    if (!this.currentItem) return;

    // Update read toggle`;
const toggleButtonReplaceStr = `  private updateToggleButtons(): void {
    if (!this.currentItem) return;

    // Update read toggle`;

content = content.replace(toggleButtonFindStr, toggleButtonReplaceStr);

const updateToggleButtonEndFindParams = `      this.starToggleButton.setAttr(
        "title",
        this.currentItem.starred ? "Remove from starred" : "Add to starred",
      );
    }
  }`;

const replacementMethods = `      this.starToggleButton.setAttr(
        "title",
        this.currentItem.starred ? "Remove from starred" : "Add to starred",
      );
    }

    this.updateSaveButtonState();
  }

  private updateSaveButtonState(): void {
    if (!this.currentItem || !this.saveToggleButton) return;

    this.saveToggleButton.classList.toggle("saved", !!this.currentItem.saved);
    this.saveToggleButton.setAttr(
      "title",
      this.currentItem.saved
        ? "View saved note"
        : this.settings.articleSaving.saveFullContent
          ? "Save full article content to notes"
          : "Save article summary to notes",
    );
  }

  private openSavedFile(item: FeedItem): void {
    if (!item.saved || !item.savedFilePath) {
      new Notice("Article is not saved yet.");
      return;
    }

    const file = this.app.vault.getAbstractFileByPath(item.savedFilePath);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf().openFile(file);
    } else {
      new Notice("Saved file not found.");
    }
  }`;

/* Because regex across CRLF is hard, let's use a simpler replace */
content = content.replace(
  /this\.starToggleButton\.classList\.toggle\([\s\S]*?this\.currentItem\.starred \? "Remove from starred" : "Add to starred",\s*\);\s*\}\s*\}/,
  replacementMethods
);

fs.writeFileSync(targetFile, content);
console.log("Modifications applied effectively.");
