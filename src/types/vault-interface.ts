/**
 * VaultInterface — Type definition documenting Obsidian's internal Vault object
 *
 * NOTE: Vault is not directly exported from the "obsidian" package. It is only
 * accessible via the App.vault property. This interface documents the methods
 * we actually use in the plugin to provide type safety where the original API
 * lacks public type definitions.
 *
 * @see https://docs.obsidian.md/Reference/TypeScript+API/Vault
 */
export interface VaultInterface {
  /**
   * Async filesystem adapter for vault operations
   * Used for reading/writing files asynchronously
   */
  adapter: {
    /**
     * Check if a file/folder exists at the given vault path
     */
    exists(path: string): Promise<boolean>;

    /**
     * Read file contents from vault path
     */
    read(path: string): Promise<string>;

    /**
     * Write contents to vault path
     */
    write(path: string, content: string): Promise<void>;
  };
}
