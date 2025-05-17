import { quote } from 'shell-quote';
import { ALLOWED_COMMANDS, log } from '../config.mjs';

/**
 * Sanitizes command arguments using shell-quote.
 * @param {string[]} args - Array of arguments.
 * @returns {string[]} Sanitized arguments.
 */
export function sanitizeCommandArgs(args = []) {
  return args.map(arg => String(arg)); // shell-quote expects strings
}

/**
 * Checks if a command is allowed and if its first argument is permitted.
 * @param {string} command - The command to execute.
 * @param {string[]} args - The arguments for the command.
 * @returns {{isAllowed: boolean, baseCommand?: string, sanitizedArgs?: string[], error?: string}}
 */
export function validateCommand(command, args = []) {
  try {
    const commandConfig = ALLOWED_COMMANDS[command];

    if (!commandConfig) {
      const errorMsg = `Command not allowed: ${command}. Allowed commands are: ${Object.keys(ALLOWED_COMMANDS).join(', ')}.`;
      log(errorMsg);
      return { isAllowed: false, error: errorMsg };
    }

    const { baseCommand, allowedArgs: permittedFirstArgs } = commandConfig;

    if (Array.isArray(permittedFirstArgs) && args.length > 0) {
      const firstArg = String(args[0]);
      if (!permittedFirstArgs.includes(firstArg)) {
        const errorMsg = `Argument "${firstArg}" for command "${baseCommand}" is not allowed. Permitted first arguments: ${permittedFirstArgs.join(', ')}.`;
        log(errorMsg);
        return { isAllowed: false, error: errorMsg };
      }
    }
    // If permittedFirstArgs is "all" or undefined, or if no args provided, no first-arg check needed.

    // Use shell-quote.quote on each arg for execFile, which takes an array of args.
    // execFile itself handles not invoking a shell, so complex quoting for shell metachars is less critical
    // than ensuring each arg is passed as a distinct entity.
    // However, if an arg itself is meant to be multiple words for the underlying command, quote won't combine them.
    // For execFile, we just need to pass the arguments as an array of strings.
    // The main sanitization is already done by command whitelisting and execFile not using a shell.
    const sanitizedArgsForExecFile = args.map(arg => String(arg));

    return { isAllowed: true, baseCommand: baseCommand || command, sanitizedArgs: sanitizedArgsForExecFile };
  } catch (error) {
    log(`Command validation error: ${error.message}`);
    return { isAllowed: false, error: `Command validation error: ${error.message}` };
  }
}
