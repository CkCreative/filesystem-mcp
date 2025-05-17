import fs from 'fs-extra';
import path from 'path';
import { ensureNotReadOnly, ensurePathAndGetAbsolute, getAbsolutePath } from '../utils/fileUtils.mjs';
import { updateProjectFact } from '../utils/projectFacts.mjs';
import { BASE_DIR, log } from '../config.mjs';

/**
 * Creates a new file with specified content.
 */
export async function createFileHandler({ path: filePath, content, mode = 0o644 }) {
  try {
    ensureNotReadOnly();
    const absolutePath = await ensurePathAndGetAbsolute(filePath, { forCreation: true });

    log(`Creating file: ${filePath} at ${absolutePath} with mode ${mode.toString(8)}`);

    // Explicitly define options object
    const writeOptions = {
      mode: mode,
      encoding: 'utf8' // Though utf8 is default for strings, being explicit might help
    };
    // Ensure content is a string, or handle buffers appropriately if they were possible
    const fileContent = (typeof content === 'string') ? content : String(content || '');

    await fs.writeFile(absolutePath, fileContent, writeOptions);

    await updateProjectFact({
      filePath,
      operation: 'create',
      description: `File created with mode ${mode.toString(8)}.`,
    });

    return {
      content: [{ type: "text", text: `File created successfully: ${filePath}` }]
    };
  } catch (error) {
    log(`Create file error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error creating file: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Reads file content, optionally by line range.
 */
export async function readFileHandler({ path: filePath, startLine, endLine }) {
  try {
    const absolutePath = await ensurePathAndGetAbsolute(filePath, { ensureExists: true });

    log(`Reading file: ${filePath}`);
    const content = await fs.readFile(absolutePath, 'utf8');
    const lines = content.split('\n');
    let resultContent = content;
    let resultMessage = `File: ${filePath}`;

    if (startLine !== undefined && endLine !== undefined) {
      const sLine = Math.max(0, startLine - 1);
      const eLine = endLine; // endLine is inclusive, slice is exclusive for end
      if (sLine >= lines.length || eLine < sLine || sLine > eLine) {
        throw new Error(`Invalid line range [${startLine}-${endLine}] for file with ${lines.length} lines.`);
      }
      resultContent = lines.slice(sLine, eLine).join('\n');
      resultMessage += `\nDisplaying lines ${startLine} to ${endLine} (of ${lines.length} total lines).`;
    } else {
      resultMessage += `\nTotal lines: ${lines.length}.`;
    }

    return {
      content: [{ type: "text", text: `${resultMessage}\n\nContent:\n${resultContent}` }]
    };
  } catch (error) {
    log(`Read file error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error reading file: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Deletes a file or directory.
 */
export async function deletePathHandler({ path: relativePath, recursive = false }) {
  try {
    ensureNotReadOnly();
    const absolutePath = await ensurePathAndGetAbsolute(relativePath, { ensureExists: true });

    const stats = await fs.stat(absolutePath);
    let operationType = '';

    if (stats.isDirectory()) {
      log(`Deleting directory: ${relativePath} (recursive: ${recursive})`);
      if (!recursive && (await fs.readdir(absolutePath)).length > 0) {
        throw new Error(`Directory "${relativePath}" is not empty. Use recursive option to delete.`);
      }
      // fs-extra's remove correctly handles recursive deletion based on its own logic if we just pass the path.
      // For explicit control matching our parameter:
      if (recursive) {
        await fs.remove(absolutePath); // This will remove non-empty directories
      } else {
        await fs.rmdir(absolutePath); // This will fail if directory is not empty
      }
      operationType = 'delete directory';
    } else if (stats.isFile()) {
      log(`Deleting file: ${relativePath}`);
      await fs.unlink(absolutePath);
      operationType = 'delete file';
    } else {
      throw new Error(`Path "${relativePath}" is not a file or directory.`);
    }

    await updateProjectFact({
      filePath: relativePath,
      operation: 'delete',
      description: `${stats.isDirectory() ? 'Directory' : 'File'} deleted. Recursive: ${recursive}.`,
    });

    return {
      content: [{ type: "text", text: `${stats.isDirectory() ? 'Directory' : 'File'} "${relativePath}" deleted successfully.` }]
    };
  } catch (error) {
    log(`Delete path error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error deleting path: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Lists directory contents.
 */
export async function listDirectoryHandler({ path: dirPath = '.', recursive = false, showDetails = false, maxDepth = 5 }) {
  try {
    const absoluteDir = await ensurePathAndGetAbsolute(dirPath, { ensureExists: true });
    if (!(await fs.stat(absoluteDir)).isDirectory()) {
      throw new Error(`Path "${dirPath}" is not a directory.`);
    }

    log(`Listing directory: ${dirPath} (recursive: ${recursive}, details: ${showDetails}, maxDepth: ${maxDepth})`);

    async function getDirContents(currentPath, currentDepth) {
      if (currentDepth > maxDepth && recursive) {
        return [{ name: `[Max depth ${maxDepth} reached for ${path.relative(BASE_DIR, currentPath)}]`, type: 'notice' }];
      }

      const entries = await fs.readdir(currentPath);
      const results = [];

      for (const entry of entries) {
        const entryAbsolutePath = path.join(currentPath, entry);
        if (!entryAbsolutePath.startsWith(BASE_DIR)) {
          log(`Skipping entry "${entry}" as it resolves outside BASE_DIR: ${entryAbsolutePath}`);
          continue;
        }
        const entryRelativePath = path.relative(BASE_DIR, entryAbsolutePath);

        try {
          const stats = await fs.lstat(entryAbsolutePath); // Use lstat to get info about symlink itself
          const item = {
            name: entry,
            path: entryRelativePath,
            type: stats.isDirectory() ? 'directory' : (stats.isFile() ? 'file' : (stats.isSymbolicLink() ? 'symlink' : 'other')),
          };

          if (showDetails) {
            item.size = stats.size;
            item.lastModified = new Date(stats.mtimeMs).toISOString();
            item.permissions = `0${(stats.mode & 0o777).toString(8)}`;
            if (stats.isSymbolicLink()) {
              try {
                const target = await fs.readlink(entryAbsolutePath);
                item.symlinkTarget = target;
              } catch (e) {
                item.symlinkTarget = '[unreadable_target]';
              }
            }
          }
          results.push(item);

          if (recursive && stats.isDirectory() && !stats.isSymbolicLink()) { // Don't recurse into symlinked directories by default here
            item.children = await getDirContents(entryAbsolutePath, currentDepth + 1);
          }
        } catch (error) {
          log(`Error stating file ${entryAbsolutePath}: ${error.message}. Skipping.`);
          results.push({ name: entry, path: entryRelativePath, type: 'error', error: error.message });
        }
      }
      return results;
    }

    const contents = await getDirContents(absoluteDir, 1);

    return {
      content: [{ type: "json", data: contents }]
    };
  } catch (error) {
    log(`List directory error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error listing directory: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Moves/renames a file or directory.
 */
export async function movePathHandler({ sourcePath, destinationPath, overwrite = false }) {
  try {
    ensureNotReadOnly();
    const absoluteSource = await ensurePathAndGetAbsolute(sourcePath, { ensureExists: true });
    // For destination, we want to ensure its parent exists if we are to create it.
    // getAbsolutePath will validate the path itself.
    const absoluteDestination = getAbsolutePath(destinationPath);

    if (absoluteSource === absoluteDestination) {
      throw new Error('Source and destination paths are the same.');
    }

    log(`Moving: ${sourcePath} -> ${destinationPath} (overwrite: ${overwrite})`);

    if (await fs.pathExists(absoluteDestination) && !overwrite) {
      throw new Error(`Destination "${destinationPath}" already exists. Use overwrite option.`);
    }

    await fs.ensureDir(path.dirname(absoluteDestination));

    await fs.move(absoluteSource, absoluteDestination, { overwrite });

    await updateProjectFact({
      filePath: sourcePath,
      operation: 'delete',
      description: `Original path for move/rename to ${destinationPath}.`,
    });
    await updateProjectFact({
      filePath: destinationPath,
      operation: 'create',
      description: `New path from move/rename of ${sourcePath}.`,
    });

    return {
      content: [{ type: "text", text: `Path "${sourcePath}" moved/renamed to "${destinationPath}" successfully.` }]
    };
  } catch (error) {
    log(`Move path error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error moving path: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Creates a new directory.
 */
export async function createDirectoryHandler({ path: dirPath, recursive = true }) {
  try {
    ensureNotReadOnly();
    const absolutePath = getAbsolutePath(dirPath); // Just get path, ensureDir will handle creation logic

    log(`Creating directory: ${dirPath} (recursive: ${recursive}) at ${absolutePath}`);
    if (recursive) {
      await fs.ensureDir(absolutePath); // Creates directory, including parents if needed. No error if exists.
    } else {
      if (await fs.pathExists(absolutePath)) {
        throw new Error(`Directory "${dirPath}" already exists.`);
      }
      // Ensure parent exists before creating the final directory if not recursive for parents
      await fs.ensureDir(path.dirname(absolutePath));
      await fs.mkdir(absolutePath); // This will fail if parent doesn't exist or dirPath itself exists
    }

    await updateProjectFact({
      filePath: dirPath,
      operation: 'create',
      description: `Directory created. Recursive: ${recursive}.`,
    });

    return {
      content: [{ type: "text", text: `Directory "${dirPath}" created successfully.` }]
    };
  } catch (error) {
    log(`Create directory error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error creating directory: ${error.message}` }],
      isError: true
    };
  }
}

/**
 * Gets metadata for a file or directory.
 */
export async function getFileMetadataHandler({ path: relativePath }) {
  try {
    const absolutePath = await ensurePathAndGetAbsolute(relativePath, { ensureExists: true });
    log(`Getting metadata for: ${relativePath}`);

    const stats = await fs.lstat(absolutePath); // Use lstat to get info about symlink itself, not its target
    const metadata = {
      path: relativePath,
      absolutePath: absolutePath, // For debug, not usually for LLM
      type: stats.isDirectory() ? 'directory' : (stats.isFile() ? 'file' : (stats.isSymbolicLink() ? 'symlink' : 'other')),
      size: stats.size,
      permissionsOctal: `0${(stats.mode & 0o777).toString(8)}`,
      atime: new Date(stats.atimeMs).toISOString(),
      mtime: new Date(stats.mtimeMs).toISOString(),
      ctime: new Date(stats.ctimeMs).toISOString(),
      birthtime: new Date(stats.birthtimeMs).toISOString(),
      uid: stats.uid,
      gid: stats.gid,
      isBlockDevice: stats.isBlockDevice(),
      isCharacterDevice: stats.isCharacterDevice(),
      isFIFO: stats.isFIFO(),
      isSocket: stats.isSocket(),
    };

    if (stats.isSymbolicLink()) {
      try {
        metadata.symlinkTarget = await fs.readlink(absolutePath);
      } catch (e) {
        metadata.symlinkTarget = '[unreadable_target]';
      }
    }

    return {
      content: [{ type: "json", data: metadata }]
    };
  } catch (error) {
    log(`Get file metadata error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error getting file metadata: ${error.message}` }],
      isError: true
    };
  }
}
