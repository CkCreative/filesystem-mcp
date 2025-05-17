import fs from 'fs-extra';
import path from 'path';
import * as diffLib from 'diff';
import { glob } from 'glob';
import { ensureNotReadOnly, ensurePathAndGetAbsolute } from '../utils/fileUtils.mjs';
import { updateProjectFact } from '../utils/projectFacts.mjs';
import { BASE_DIR, PROJECT_FACTS_FILE, log } from '../config.mjs';

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

/**
 * Compares an existing file with LLM-generated content.
 */
export async function diffWithLLMHandler({ filePath, llmContent, format = 'unified' }) {
  try {
    const absolutePath = ensurePathAndGetAbsolute(filePath); // Don't require it to exist for diffing

    log(`Diffing file: ${filePath} with LLM content (format: ${format})`);
    let originalContent = '';
    if (await fs.pathExists(absolutePath)) {
      originalContent = await fs.readFile(absolutePath, 'utf8');
    } else {
      log(`File ${filePath} does not exist. Diffing against empty content.`);
    }

    let diffResult;
    if (format === 'unified') {
      diffResult = diffLib.createPatch(filePath, originalContent, llmContent, 'Original', 'LLM Generated');
    } else if (format === 'json') {
      const diffArray = diffLib.diffLines(originalContent, llmContent, { newlineIsToken: true });
      diffResult = JSON.stringify(diffArray.map(part => ({
        value: part.value,
        added: part.added || false,
        removed: part.removed || false,
        count: part.count,
      })), null, 2);
    } else if (format === 'html') {
      const diffArray = diffLib.diffLines(originalContent, llmContent);
      let html = '<pre><div class="diff" style="font-family: monospace; white-space: pre;">';
      diffArray.forEach(part => {
        const color = part.added ? 'green' : part.removed ? 'red' : 'grey';
        const spanClass = part.added ? 'added' : part.removed ? 'removed' : 'unchanged';
        const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
        // Escape only the value part, not the prefix or html structure
        // Handle multiline parts correctly for HTML diff
        const lines = part.value.split('\n');
        lines.forEach((line, index, arr) => {
          // Avoid adding an extra <br> for the very last empty line if part.value ends with \n
          if (index === arr.length - 1 && line === '' && part.value.endsWith('\n')) return;
          html += `<span class="${spanClass}" style="color:${color}; display: block;">${escapeHtml(prefix + line)}</span>`;
        });
      });
      html += '</div></pre>';
      diffResult = html;
    } else {
      throw new Error(`Unsupported diff format: ${format}. Supported formats: unified, json, html.`);
    }

    if (format === 'html') {
      // For HTML diff, the diffResult IS the HTML. The message part should be text.
      return {
        content: [
          { type: "text", text: `Diff between original file "${filePath}" and LLM content (HTML format):` },
          { type: "html", html: diffResult }
        ]
      };
    }

    return {
      content: [{ type: "text", text: `Diff between original file "${filePath}" and LLM content (${format} format):\n\n${diffResult}` }]
    };
  } catch (error) {
    log(`Diff error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error generating diff: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Applies LLM-generated content to a file.
 */
export async function applyLLMChangesHandler({ filePath, llmContent, backup = true }) {
  try {
    ensureNotReadOnly();
    const absolutePath = await ensurePathAndGetAbsolute(filePath, { forCreation: true });

    log(`Applying LLM changes to file: ${filePath} (backup: ${backup})`);
    let backupFilePath = null;
    if (backup && await fs.pathExists(absolutePath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupFilePath = `${absolutePath}.${timestamp}.backup`;
      await fs.copy(absolutePath, backupFilePath);
      log(`Backup created at: ${backupFilePath}`);
    }

    await fs.writeFile(absolutePath, llmContent);

    await updateProjectFact({
      filePath,
      operation: 'update',
      description: `File updated by LLM. Backup: ${backupFilePath ? path.relative(BASE_DIR, backupFilePath) : 'No'}.`,
    });

    return {
      content: [{
        type: "text",
        text: `Changes applied to "${filePath}" successfully.\n` +
          (backupFilePath ? `Backup created at: ${path.relative(BASE_DIR, backupFilePath)}` : 'No backup was created.'),
      }]
    };
  } catch (error) {
    log(`Apply LLM changes error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error applying changes: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Searches for a string or regex pattern within files.
 */
export async function searchInFilesHandler({ searchTerm, directoryPath = '.', filePattern = '**/*', isRegex = false, caseSensitive = false, recursive = true }) {
  try {
    const absoluteSearchDir = await ensurePathAndGetAbsolute(directoryPath, { ensureExists: true });
    if (!(await fs.stat(absoluteSearchDir)).isDirectory()) {
      throw new Error(`Search path "${directoryPath}" is not a directory.`);
    }

    log(`Searching for "${searchTerm}" in "${directoryPath}/${filePattern}" (regex: ${isRegex}, caseSensitive: ${caseSensitive}, recursive: ${recursive})`);

    const globOptions = {
      cwd: absoluteSearchDir,
      nodir: true, // Only files
      dot: true, // Include dotfiles
      ignore: [`${PROJECT_FACTS_FILE}`, `**/node_modules/**`, `**/.git/**`], // Default ignores
      nocase: !caseSensitive, // Note: glob's nocase applies to path matching, not content.
      maxDepth: recursive ? undefined : 1, // if not recursive, depth is 1 (files in current dir only)
    };

    const files = await glob(filePattern, globOptions);
    const results = [];
    // For RegExp, flags are built based on caseSensitive and global (implied by iterating lines/matches)
    const regexFlags = caseSensitive ? 'g' : 'gi'; // Always global for exec loop
    const pattern = isRegex ? new RegExp(searchTerm, regexFlags) : searchTerm;

    for (const file of files) {
      const absoluteFilePath = path.join(absoluteSearchDir, file);
      // Ensure we don't try to read from outside BASE_DIR again (though glob should respect cwd)
      if (!absoluteFilePath.startsWith(BASE_DIR)) {
        log(`Skipping file "${file}" as it resolves outside BASE_DIR: ${absoluteFilePath}`);
        continue;
      }
      const relativeFilePathToProjectRoot = path.relative(BASE_DIR, absoluteFilePath);

      try {
        const content = await fs.readFile(absoluteFilePath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          let match;
          if (isRegex && pattern instanceof RegExp) { // pattern is RegExp here
            pattern.lastIndex = 0; // Reset lastIndex for global regexes before each line
            while ((match = pattern.exec(line)) !== null) {
              results.push({
                filePath: relativeFilePathToProjectRoot,
                lineNumber: index + 1,
                matchPosition: match.index,
                matchingText: match[0],
                lineContent: line,
              });
            }
          } else if (typeof pattern === 'string') { // pattern is string here
            const searchStr = caseSensitive ? pattern : pattern.toLowerCase();
            const lineToSearch = caseSensitive ? line : line.toLowerCase();
            let startIndex = 0;
            let matchIndex;
            while ((matchIndex = lineToSearch.indexOf(searchStr, startIndex)) !== -1) {
              results.push({
                filePath: relativeFilePathToProjectRoot,
                lineNumber: index + 1,
                matchPosition: matchIndex,
                matchingText: line.substring(matchIndex, matchIndex + pattern.length),
                lineContent: line,
              });
              startIndex = matchIndex + searchStr.length;
            }
          }
        });
      } catch (error) {
        log(`Error reading file ${absoluteFilePath} during search: ${error.message}`);
      }
    }

    if (results.length === 0) {
      return { content: [{ type: "text", text: `No matches found for "${searchTerm}".` }] };
    }
    return { content: [{ type: "json", data: results }] };
  } catch (error) {
    log(`Search error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error searching files: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Finds and replaces text within a specific file.
 */
export async function replaceInFileHandler({ filePath, searchTerm, replacementText, isRegex = false, replaceAll = true, backup = true, caseSensitive = false }) {
  try {
    ensureNotReadOnly();
    const absolutePath = await ensurePathAndGetAbsolute(filePath, { ensureExists: true });

    log(`Replacing "${searchTerm}" with "${replacementText}" in "${filePath}" (regex: ${isRegex}, all: ${replaceAll}, backup: ${backup})`);

    let originalContent = await fs.readFile(absolutePath, 'utf8');
    let newContent;
    let replacementsMade = 0;

    const flags = (replaceAll ? 'g' : '') + (caseSensitive ? '' : 'i');
    const pattern = isRegex ? new RegExp(searchTerm, flags) : new RegExp(
      searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      flags
    );

    if (replaceAll) {
      newContent = originalContent.replace(pattern, (match) => {
        replacementsMade++;
        return replacementText;
      });
    } else { // Only replace first
      newContent = originalContent.replace(pattern, (match) => {
        if (replacementsMade === 0) { // Only act if no replacement has been made yet
          replacementsMade++;
          return replacementText;
        }
        return match; // For subsequent "matches" by a global regex, return the original match
      });
    }

    if (replacementsMade === 0) {
      return { content: [{ type: "text", text: `No occurrences of "${searchTerm}" found in "${filePath}". File not changed.` }] };
    }

    if (backup) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilePath = `${absolutePath}.${timestamp}.backup`;
      await fs.copy(absolutePath, backupFilePath);
      log(`Backup created at: ${backupFilePath}`);
    }

    await fs.writeFile(absolutePath, newContent, 'utf8');

    await updateProjectFact({
      filePath,
      operation: 'update',
      description: `Replaced "${searchTerm}" with "${replacementText}". ${replacementsMade} replacement(s). Backup: ${backup ? 'Yes' : 'No'}.`,
    });

    return {
      content: [{ type: "text", text: `${replacementsMade} occurrence(s) of "${searchTerm}" replaced with "${replacementText}" in "${filePath}".` }]
    };
  } catch (error) {
    log(`Replace error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error replacing in file: ${error.message}` }],
      isError: true
    };
  }
}
