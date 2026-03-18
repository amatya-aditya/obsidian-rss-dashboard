/**
 * Forbidden characters in Obsidian filenames (most restrictive set across all OS)
 * [ ] # ^ | / \ : * " < > ?
 */
const FORBIDDEN_CHARS_REGEX = /[\\/:*?"<>|#^[\]]/g;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a folder name based on Obsidian's forbidden characters and path separator rules.
 * @param name The folder name to validate
 * @returns ValidationResult with status and optional error message
 */
export function isValidFolderName(name: string): ValidationResult {
  if (!name || name.trim() === "") {
    return { valid: false, error: "Folder name cannot be empty." };
  }

  const trimmedName = name.trim();

  if (trimmedName.startsWith(".")) {
    return { valid: false, error: "Folder name cannot start with a dot." };
  }

  const match = trimmedName.match(FORBIDDEN_CHARS_REGEX);
  if (match) {
    // Unique list of forbidden characters found
    const uniqueChars = Array.from(new Set(match)).join(" ");
    return {
      valid: false,
      error: `Folder name contains forbidden characters: ${uniqueChars}`,
    };
  }

  return { valid: true };
}

/**
 * Validates a feed title. Uses the same rules as folders for consistency and filename safety.
 * @param title The feed title to validate
 * @returns ValidationResult with status and optional error message
 */
export function isValidFeedTitle(title: string): ValidationResult {
  if (!title || title.trim() === "") {
    return { valid: false, error: "Feed title cannot be empty." };
  }

  const trimmedTitle = title.trim();

  if (trimmedTitle.startsWith(".")) {
    return { valid: false, error: "Feed title cannot start with a dot." };
  }

  const match = trimmedTitle.match(FORBIDDEN_CHARS_REGEX);
  if (match) {
    const uniqueChars = Array.from(new Set(match)).join(" ");
    return {
      valid: false,
      error: `Feed title contains forbidden characters: ${uniqueChars}`,
    };
  }

  return { valid: true };
}

/**
 * Sanitizes a folder name or feed title by replacing forbidden characters and stripping leading dots.
 * Useful for automated imports like OPML.
 * @param name The name to sanitize
 * @returns The sanitized name
 */
export function sanitizeName(name: string): string {
  if (!name) return "Unnamed";

  let sanitized = name.replace(FORBIDDEN_CHARS_REGEX, "_").trim();

  // Strip leading dots
  while (sanitized.startsWith(".")) {
    sanitized = sanitized.substring(1).trim();
  }

  // If the result consists only of underscores and the original had no underscores, 
  // it means everything was forbidden characters.
  if (sanitized && !sanitized.replace(/_/g, "").trim() && !name.includes("_")) {
    return "Unnamed";
  }

  return sanitized || "Unnamed";
}
