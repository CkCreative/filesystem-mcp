import fs from 'fs-extra';
import path from 'path';
import { getProjectFacts as getAllFacts, updateProjectFact as doUpdateFact, clearProjectFacts as doClearFacts } from '../utils/projectFacts.mjs';
import { ensureNotReadOnly, ensurePathAndGetAbsolute, getAbsolutePath } from '../utils/fileUtils.mjs';
import { BASE_DIR, PROJECT_FACTS_FILE, log } from '../config.mjs';

/**
 * Gets the project facts file content.
 */
export async function getProjectFactsHandler() {
  try {
    const facts = await getAllFacts();
    if (facts.length === 0) {
      return {
        content: [{ type: "text", text: `Project facts file (${PROJECT_FACTS_FILE}) is empty or does not exist.` }]
      };
    }
    return {
      content: [
        { type: "text", text: `Project Facts (${PROJECT_FACTS_FILE}):` },
        { type: "json", data: facts }
      ]
    };
  } catch (error) {
    log(`Get project facts error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error getting project facts: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Updates/adds a description to a project fact.
 * This is a more specific version of direct project fact update.
 */
export async function updateProjectFactDescriptionHandler({ filePath, description }) {
  try {
    // This will create a new 'describe' operation fact entry.
    await doUpdateFact({
      filePath,
      operation: 'describe',
      description: description || 'No description provided.',
    });

    return {
      content: [{ type: "text", text: `Project fact description updated for file: ${filePath}` }]
    };
  } catch (error) {
    log(`Update project fact description error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error updating project fact description: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Gets the project structure as a tree.
 */
export async function getProjectStructureHandler({ directoryPath = '.', maxDepth = 5 }) {
  try {
    const absoluteStartDir = await ensurePathAndGetAbsolute(directoryPath, { ensureExists: true });
    if (!(await fs.stat(absoluteStartDir)).isDirectory()) {
      throw new Error(`Path "${directoryPath}" is not a directory.`);
    }

    log(`Getting project structure for "${directoryPath}" (maxDepth: ${maxDepth})`);

    async function buildTree(currentAbsoluteDir, currentRelativeDir, currentDepth) {
      if (currentDepth > maxDepth) {
        return { name: path.basename(currentAbsoluteDir), type: 'directory', path: currentRelativeDir, children: '[Max depth reached]' };
      }

      const dirents = await fs.readdir(currentAbsoluteDir, { withFileTypes: true });
      const children = [];

      for (const dirent of dirents) {
        // Skip common ignored files/dirs for cleaner output
        if (['.git', 'node_modules', '.DS_Store', PROJECT_FACTS_FILE].includes(dirent.name)) {
          continue;
        }
        const childAbsolutePath = path.join(currentAbsoluteDir, dirent.name);
        const childRelativePath = path.join(currentRelativeDir, dirent.name);

        if (dirent.isDirectory()) {
          children.push(await buildTree(childAbsolutePath, childRelativePath, currentDepth + 1));
        } else if (dirent.isFile()) {
          children.push({ name: dirent.name, type: 'file', path: childRelativePath });
        } else if (dirent.isSymbolicLink()) {
          // Could try to resolve symlink, but for now just mark it
          try {
            const targetPath = await fs.readlink(childAbsolutePath);
            const targetAbsolute = path.resolve(path.dirname(childAbsolutePath), targetPath);
            const targetRelative = path.relative(BASE_DIR, targetAbsolute);
            const isTargetAllowed = targetAbsolute.startsWith(BASE_DIR);
            children.push({
              name: dirent.name,
              type: 'symlink',
              path: childRelativePath,
              target: targetPath,
              targetRelative: isTargetAllowed ? targetRelative : '[points outside base_dir]',
              targetAccessible: isTargetAllowed && await fs.pathExists(targetAbsolute)
            });
          } catch (e) {
            children.push({ name: dirent.name, type: 'symlink', path: childRelativePath, target: '[unreadable]' });
          }
        }
      }
      children.sort((a, b) => { // Sort: directories first, then by name
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
      return { name: path.basename(currentAbsoluteDir), type: 'directory', path: currentRelativeDir, children };
    }

    const tree = await buildTree(absoluteStartDir, directoryPath === '.' ? '' : directoryPath, 1);
    // If starting path was '.', adjust name for root
    if (directoryPath === '.') tree.name = '[Project Root]';

    return { content: [{ type: "json", data: tree }] };
  } catch (error) {
    log(`Get project structure error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error getting project structure: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Clears the project facts file.
 */
export async function clearProjectFactsHandler() {
  try {
    ensureNotReadOnly();
    await doClearFacts();
    return {
      content: [{ type: "text", text: `Project facts file (${PROJECT_FACTS_FILE}) has been cleared.` }]
    };
  } catch (error) {
    log(`Clear project facts error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error clearing project facts: ${error.message}` }],
      isError: true
    };
  }
}
