import fs from 'fs-extra';
import crypto from 'crypto';
import path from 'path';  // Add missing path import
import { PROJECT_FACTS_PATH, log } from '../config.mjs';
import { getAbsolutePath } from './fileUtils.mjs'; // To resolve filePath relative to BASE_DIR

/**
 * @typedef {Object} ProjectFactEntry
 * @property {string} filePath - Relative path from BASE_DIR.
 * @property {string} description - Description of the file or change.
 * @property {string} createdAt - ISO timestamp of creation of this fact.
 * @property {string} lastModifiedByLLMAt - ISO timestamp of last modification by LLM.
 * @property {'create' | 'update' | 'delete' | 'describe'} operation - The type of operation.
 * @property {string} [contentHash] - SHA256 hash of the file content at the time of this fact.
 * @property {object} [metadata] - Other relevant metadata.
 */

/**
 * Reads the project facts file.
 * @returns {Promise<ProjectFactEntry[]>} Array of project fact entries.
 */
async function readProjectFactsFile() {
  try {
    if (await fs.pathExists(PROJECT_FACTS_PATH)) {
      const content = await fs.readFile(PROJECT_FACTS_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    log('Error reading project facts file, returning empty array:', error.message);
  }
  return [];
}

/**
 * Writes the project facts to file.
 * @param {ProjectFactEntry[]} facts - Array of project fact entries.
 */
async function writeProjectFactsFile(facts) {
  try {
    await fs.ensureDir(path.dirname(PROJECT_FACTS_PATH)); // Ensure directory exists
    await fs.writeFile(PROJECT_FACTS_PATH, JSON.stringify(facts, null, 2), 'utf8');
  } catch (error) {
    log('Error writing project facts file:', error.message);
  }
}

/**
 * Generates a content hash for a file.
 * @param {string} absoluteFilePath - Absolute path to the file.
 * @returns {Promise<string|undefined>} SHA256 hash or undefined if file doesn't exist.
 */
async function generateContentHash(absoluteFilePath) {
  try {
    if (await fs.pathExists(absoluteFilePath) && (await fs.stat(absoluteFilePath)).isFile()) {
      const fileBuffer = await fs.readFile(absoluteFilePath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      return hashSum.digest('hex');
    }
  } catch (error) {
    log(`Error generating content hash for ${absoluteFilePath}:`, error.message);
  }
  return undefined;
}

/**
 * Updates or adds a project fact.
 * @param {Object} details
 * @param {string} details.filePath - Relative path to the file.
 * @param {'create' | 'update' | 'delete' | 'describe'} details.operation - The operation type.
 * @param {string} [details.description] - Description of the file/change.
 * @param {object} [details.metadata] - Additional metadata.
 */
export async function updateProjectFact({ filePath, operation, description, metadata }) {
  if (!filePath) {
    log('Skipping project fact update: filePath is required.');
    return;
  }

  const facts = await readProjectFactsFile();
  const now = new Date().toISOString();

  let absoluteFilePath;
  try {
    absoluteFilePath = getAbsolutePath(filePath); // Can throw if path is bad
  } catch (error) {
    log(`Skipping project fact update for "${filePath}": Invalid path. ${error.message}`);
    return;
  }

  const contentHash = operation !== 'delete' ? await generateContentHash(absoluteFilePath) : undefined;

  const newFact = {
    filePath,
    description: description || `${operation} operation performed.`,
    createdAt: now,
    lastModifiedByLLMAt: now,
    operation,
    contentHash,
    metadata: metadata || {},
  };

  // For simplicity, we'll add a new entry for each operation.
  // A more advanced system might update existing entries based on filePath.
  facts.push(newFact);

  // Optional: Prune old facts or limit the size of the facts file
  // if (facts.length > 1000) facts.splice(0, facts.length - 1000);

  await writeProjectFactsFile(facts);
  log(`Project fact updated for "${filePath}" - Operation: ${operation}`);
}

/**
 * Gets all project facts.
 * @returns {Promise<ProjectFactEntry[]>}
 */
export async function getProjectFacts() {
  return readProjectFactsFile();
}

/**
 * Clears all project facts.
 * (This might be a tool for the LLM too, or an admin function)
 */
export async function clearProjectFacts() {
  await writeProjectFactsFile([]);
  log('Project facts cleared.');
}
