import { BASE_DIR, PROJECT_FACTS_FILE, READ_ONLY_MODE, ALLOWED_COMMANDS, COMMAND_TIMEOUT, log } from '../config.mjs';
import os from 'os';

/**
 * Gets environment information about the MCP server.
 */
export async function getEnvironmentInfoHandler() {
  try {
    log('Getting environment info');
    const sdkPackageJson = await import('@modelcontextprotocol/sdk/package.json', { assert: { type: 'json' } });
    const ownPackageJson = await import('../../package.json', { assert: { type: 'json' } });

    const info = {
      serverName: ownPackageJson.default.name,
      serverVersion: ownPackageJson.default.version,
      mcpSdkVersion: sdkPackageJson.default.version,
      baseDirectory: BASE_DIR,
      projectFactsFile: PROJECT_FACTS_FILE,
      readOnlyMode: READ_ONLY_MODE,
      defaultCommandTimeoutMs: COMMAND_TIMEOUT,
      allowedCommands: Object.keys(ALLOWED_COMMANDS),
      platform: os.platform(),
      nodeVersion: process.version,
    };

    return {
      content: [
        { type: "text", text: 'Filesystem MCP Server Environment Information:' },
        { type: "text", text: JSON.stringify(info, null, 2) }
      ]
    };
  } catch (error) {
    log(`Get environment info error: ${error.message}`);
    return {
      content: [{ type: "text", text: `Error getting environment info: ${error.message}` }],
      isError: true
    };
  }
}
