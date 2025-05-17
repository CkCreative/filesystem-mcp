import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Base directory for all file operations.
 * Resolved relative to the application root if MCP_BASE_DIR is relative,
 * or used as an absolute path if MCP_BASE_DIR is absolute.
 */
export const BASE_DIR = path.resolve(process.env.MCP_BASE_DIR || path.join(__dirname, '..', 'project-output'));

/**
 * Name of the project facts file.
 */
export const PROJECT_FACTS_FILE = 'projectfacts.json';

/**
 * Path to the project facts file.
 */
export const PROJECT_FACTS_PATH = path.join(BASE_DIR, PROJECT_FACTS_FILE);

/**
 * Read-only mode. If true, destructive operations are disabled.
 */
export const READ_ONLY_MODE = process.env.MCP_READ_ONLY_MODE === 'true';

/**
 * Default timeout for command execution in milliseconds.
 */
export const COMMAND_TIMEOUT = parseInt(process.env.MCP_COMMAND_TIMEOUT || '30000', 10);

/**
 * Whitelisted commands for the executeCommand tool.
 * Structure: { commandName: { baseCommand: "git", allowedArgs?: string[] | "all" } }
 * If allowedArgs is undefined or "all", all arguments are passed after sanitization.
 * If allowedArgs is an array, only arguments from that array are permitted as the first argument.
 */
export const ALLOWED_COMMANDS = {
  git: { baseCommand: 'git', allowedArgs: ['status', 'diff', 'log', 'show', 'branch', 'tag', 'rev-parse'] },
  grep: { baseCommand: 'grep' }, // All args allowed after sanitization
  find: { baseCommand: 'find' },
  ls: { baseCommand: 'ls' },
  cat: { baseCommand: 'cat' },
  diff: { baseCommand: 'diff' },
  mkdir: { baseCommand: 'mkdir' },
  // 'rm', 'cp', 'mv' are handled by specific tools now for better control
};

// For debugging - logs to stderr
export const log = (...args) => console.error('[FS-MCP]', ...args);

log(`Configuration loaded:`);
log(`  BASE_DIR: ${BASE_DIR}`);
log(`  PROJECT_FACTS_FILE: ${PROJECT_FACTS_FILE}`);
log(`  PROJECT_FACTS_PATH: ${PROJECT_FACTS_PATH}`);
log(`  READ_ONLY_MODE: ${READ_ONLY_MODE}`);
log(`  COMMAND_TIMEOUT: ${COMMAND_TIMEOUT}ms`);
log(`  ALLOWED_COMMANDS: ${Object.keys(ALLOWED_COMMANDS).join(', ')}`);

// Ensure BASE_DIR exists
import fs from 'fs-extra';
fs.ensureDirSync(BASE_DIR);
log(`Base directory ${BASE_DIR} ensured.`);
