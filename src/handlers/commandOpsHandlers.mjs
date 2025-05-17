import { execFile } from 'child_process';
import { ensureNotReadOnly, getAbsolutePath, isPathAllowed } from '../utils/fileUtils.mjs';
import { validateCommand } from '../utils/security.mjs';
import { COMMAND_TIMEOUT, BASE_DIR, log } from '../config.mjs';

/**
 * Executes a whitelisted command.
 */
export async function executeCommandHandler({ command, args = [], workingDirRel, stdinContent, timeout = COMMAND_TIMEOUT }) {
  try {
    ensureNotReadOnly(); // Some commands might be destructive, though whitelist helps.

    const validation = validateCommand(command, args);
    if (!validation.isAllowed) {
      throw new Error(validation.error || `Command "${command}" execution denied.`);
    }

    const { baseCommand, sanitizedArgs } = validation;

    let cwd = BASE_DIR; // Default working directory to BASE_DIR
    if (workingDirRel) {
      if (!isPathAllowed(workingDirRel)) { // Validate against BASE_DIR, not process.cwd()
        throw new Error(`Working directory "${workingDirRel}" is not allowed.`);
      }
      cwd = getAbsolutePath(workingDirRel); // Resolve relative to BASE_DIR
    }

    log(`Executing command: ${baseCommand} ${sanitizedArgs.join(' ')} in ${cwd}`);

    const result = await new Promise((resolve) => {
      const options = {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        shell: false, // execFile does not use a shell by default
        windowsHide: true,
      };

      const child = execFile(baseCommand, sanitizedArgs, options, (error, stdout, stderr) => {
        const exitCode = error ? error.code : 0;
        const result = {
          command: `${baseCommand} ${sanitizedArgs.join(' ')}`,
          workingDirectory: cwd,
          exitCode: exitCode,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          killed: error?.killed || false,
          signal: error?.signal || null,
          message: error ? `Command failed with exit code ${exitCode}.` : 'Command executed successfully.',
        };

        if (error && exitCode !== 0) { // Some tools like diff exit with 1 on differences, not necessarily an "error"
          log(`Command ${baseCommand} exited with code ${exitCode}. Stderr: ${stderr.toString().substring(0, 100)}`);
        }

        resolve(result);
      });

      if (stdinContent && typeof stdinContent === 'string') {
        child.stdin.write(stdinContent);
        child.stdin.end();
      }
    });

    return { content: [{ type: "json", data: result }] };
  } catch (error) {
    log(`Command execution error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Command execution error: ${error.message}` }],
      isError: true
    };
  }
}
