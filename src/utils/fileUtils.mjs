import path from 'path';
import fs from 'fs-extra';
import { BASE_DIR, READ_ONLY_MODE, log } from '../config.mjs';

/**
 * Checks if a given file path is within the allowed BASE_DIR.
 * @param {string} relativePath - The relative path to check.
 * @returns {boolean} True if the path is allowed, false otherwise.
 */
export function isPathAllowed(relativePath) {
  if (typeof relativePath !== 'string') {
    log('Path validation failed: relativePath is not a string:', relativePath);
    return false;
  }
  const normalizedRelativePath = path.normalize(relativePath);

  // Prevent navigation to parent directories like '..' or '../..' at the start
  if (normalizedRelativePath.startsWith('..')) {
    log('Path validation failed: relativePath starts with "..":', normalizedRelativePath);
    return false;
  }

  const absolutePath = path.resolve(BASE_DIR, normalizedRelativePath);

  // Check if the resolved absolute path is still within or equal to BASE_DIR
  const isAllowed = absolutePath.startsWith(BASE_DIR + path.sep) || absolutePath === BASE_DIR;
  if (!isAllowed) {
    log(`Path validation failed: Path "${absolutePath}" is outside BASE_DIR "${BASE_DIR}"`);
  }
  return isAllowed;
}

/**
 * Gets the absolute path from a relative path, ensuring it's within BASE_DIR.
 * @param {string} relativePath - The relative path.
 * @returns {string} The absolute path.
 * @throws {Error} If the path is not allowed or relativePath is invalid.
 */
export function getAbsolutePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Invalid relative path provided.');
  }
  if (!isPathAllowed(relativePath)) {
    throw new Error(`Path not allowed: "${relativePath}" is outside the configured base directory or is invalid.`);
  }
  return path.resolve(BASE_DIR, path.normalize(relativePath));
}

/**
 * Ensures the operation is not destructive if in read-only mode.
 * @throws {Error} If in read-only mode and the operation is destructive.
 */
export function ensureNotReadOnly() {
  if (READ_ONLY_MODE) {
    throw new Error('Operation not allowed: Server is in read-only mode.');
  }
}

/**
 * Helper to ensure path is allowed and get absolute path.
 * Also creates parent directories if ensureExists is true and for creation.
 * @param {string} relativePath - The relative path.
 * @param {Object} options - Options for path handling.
 * @param {boolean} [options.ensureExists=false] - If true, checks if file/dir exists. Throws if not.
 * @param {boolean} [options.forCreation=false] - If true, parent directories will be ensured.
 * @returns {string} The absolute path.
 * @throws {Error} If path not allowed, or if ensureExists fails.
 */
export async function ensurePathAndGetAbsolute(relativePath, options = {}) {
  const { ensureExists = false, forCreation = false } = options;
  const absolutePath = getAbsolutePath(relativePath); // This already checks if path is allowed

  try {
    if (forCreation) {
      await fs.ensureDir(path.dirname(absolutePath));
    }

    if (ensureExists) {
      if (!(await fs.pathExists(absolutePath))) {
        throw new Error(`Path does not exist: ${relativePath}`);
      }
    }
    return absolutePath;
  } catch (error) {
    log(`Path error for ${relativePath}: ${error.message}`);
    throw error;
  }
}
