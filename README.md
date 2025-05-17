# Filesystem MCP Server for LLMs

[![Filesystem MCP Server Demo](https://img.youtube.com/vi/ZYOsaGRsmoQ/0.jpg)](https://youtu.be/ZYOsaGRsmoQ?si=Vq95bCNZZrhPxokE)
*Click the image above to watch the demo on YouTube (Note: Demo may reflect an earlier version)*

A Model Context Protocol (MCP) server that empowers LLMs (like Claude via Claude Desktop) to interact with your local filesystem in a secure, controlled, and extensible manner. It now includes Language Server Protocol (LSP) support for enhanced code intelligence.

## Overview

This project provides a Docker-based MCP server that allows LLMs to perform a wide range of filesystem operations, content manipulations, execute whitelisted shell commands, and leverage language-specific intelligence for code. It creates an isolated environment where the LLM can work with files in a designated project directory on your host machine without compromising system security.

## Features

*   **Comprehensive File Operations:** Create, read, update, delete, list, move, and get metadata for files and directories.
*   **Advanced Content Tools:**
    *   View differences between existing files and LLM-generated content (unified, JSON, HTML formats).
    *   Apply LLM-generated changes to files with optional backups.
    *   Search for text/regex within files.
    *   Find and replace text/regex in files.
*   **Language Intelligence (via LSP):** Provides code diagnostics, completions, go-to-definition, and document formatting for JavaScript, TypeScript, and Vue.js files.
*   **Project Context Management:**
    *   Track file operations and descriptions in a structured `projectfacts.json` log.
    *   View project directory structure as a tree.
*   **Controlled Command Execution:** Execute whitelisted shell commands (e.g., `git`, `grep`, `ls`) in the project directory.
*   **Configurable & Secure:**
    *   Operates within a user-defined host directory via Docker volume mounting.
    *   Optional read-only mode.
    *   Configurable command execution timeout.
    *   Path validation to prevent access outside the designated project directory.
*   **Docker Isolation:** Runs in a Docker container for enhanced security and consistent environment, now including pre-installed language servers.

## Prerequisites

*   Docker installed and running.
*   Claude Desktop app (or any other MCP-compatible client).
*   Basic understanding of command line and Docker.

## Quick Start

### 1. Clone or Download This Repository

```bash
git clone https://github.com/CkCreative/filesystem-mcp.git # Or your repo URL
cd filesystem-mcp```

### 2. Build the Docker Image

From the root of the cloned repository:
```bash
docker build -t filesystem-mcp-ex .
```
(We use `filesystem-mcp-ex` to denote the extended version. This image now includes `typescript-language-server` and `@volar/vue-language-server`).

### 3. Create Your Project Directory on Host

This is where the LLM will read and write files. You can choose any location.
```bash
mkdir -p ~/my-llm-projects/project-alpha
```
Replace `~/my-llm-projects/project-alpha` with your desired absolute path.

### 4. Configure Claude Desktop (or other MCP Client)

1.  Open Claude Desktop.
2.  Go to Settings → Developer.
3.  Click "Edit Config" to open your `claude_desktop_config.json` file.
4.  Add the following configuration to the `mcpServers` object:

    ```json
    {
      "mcpServers": {
        "my-project-env": { // You can name this key anything descriptive
          "command": "docker",
          "args": [
            "run",
            "-i",          // Keep STDIN open
            "--rm",        // Automatically remove container on exit
            "-v", "/ABSOLUTE/PATH/TO/YOUR/HOST/PROJECT/DIR:/app/project", // *** CHANGE THIS ***
            // Optional: Environment variables for further configuration
            // "-e", "MCP_READ_ONLY_MODE=true", // Example: Start in read-only mode
            // "-e", "MCP_COMMAND_TIMEOUT=60000", // Example: Set command timeout to 60s
            "filesystem-mcp-ex" // The Docker image name you built
          ]
        }
      }
    }
    ```

    **Crucially, replace `/ABSOLUTE/PATH/TO/YOUR/HOST/PROJECT/DIR` with the actual absolute path to the directory you created in step 3.**
    For example, if you created `~/my-llm-projects/project-alpha`, and your username is `user`, this might be:
    *   Linux/macOS: `"/home/user/my-llm-projects/project-alpha:/app/project"`
    *   Windows (using WSL paths or Docker Desktop's path conversion): `"C:/Users/user/my-llm-projects/project-alpha:/app/project"` (Docker path conventions may vary slightly on Windows).

5.  Save the `claude_desktop_config.json` file.
6.  Restart Claude Desktop for the changes to take effect.

## Available Tools

Once connected, the LLM will have access to the following tools (input parameters are Zod-validated):

**File Operations:**
*   `createFile(path, content, mode?)`: Creates a new file.
*   `readFile(path, startLine?, endLine?)`: Reads file content, optionally by line range.
*   `deletePath(path, recursive?)`: Deletes a file or directory.
*   `listDirectory(path?, recursive?, showDetails?, maxDepth?)`: Lists directory contents.
*   `movePath(sourcePath, destinationPath, overwrite?)`: Moves/renames a file or directory.
*   `createDirectory(path, recursive?)`: Creates a new directory.
*   `getFileMetadata(path)`: Gets detailed metadata for a file/directory.

**Content Manipulation & Search:**
*   `diffWithLLM(filePath, llmContent, format?)`: Compares a file with LLM content.
*   `applyLLMChanges(filePath, llmContent, backup?)`: Applies LLM content to a file.
*   `searchInFiles(searchTerm, directoryPath?, filePattern?, isRegex?, caseSensitive?, recursive?)`: Searches for text in files.
*   `replaceInFile(filePath, searchTerm, replacementText, isRegex?, replaceAll?, caseSensitive?, backup?)`: Finds and replaces text in a file.

**Language Server Protocol (LSP) Tools:**
*   `getDiagnostics(filePath)`: Retrieves language-specific diagnostics (errors, warnings) for a file.
    *   `filePath`: Relative path to the file.
*   `getCompletions(filePath, line, character)`: Gets code completion suggestions.
    *   `filePath`: Relative path to the file.
    *   `line`: Line number for completions (0-indexed).
    *   `character`: Character offset on the line for completions (0-indexed).
*   `findDefinition(filePath, line, character)`: Finds the definition location of a symbol.
    *   `filePath`: Relative path to the file.
    *   `line`: Line number of the symbol (0-indexed).
    *   `character`: Character offset of the symbol (0-indexed).
*   `formatDocument(filePath)`: Formats a document using the configured language server (e.g., Prettier via LSP).
    *   `filePath`: Relative path to the file.

**Project Context & Management:**
*   `getProjectFacts()`: Retrieves the `projectfacts.json` log.
*   `updateProjectFactDescription(filePath, description)`: Adds a description to `projectfacts.json` for a file.
*   `getProjectStructure(directoryPath?, maxDepth?)`: Gets a tree view of the project directory.
*   `clearProjectFacts()`: Clears the `projectfacts.json` log.

**Command Execution:**
*   `executeCommand(command, args?, workingDirRel?, stdinContent?, timeout?)`: Executes a whitelisted command.
    *   Default whitelisted commands (can be seen in `src/config.mjs`): `git` (limited subcommands), `grep`, `find`, `ls`, `cat`, `diff`, `mkdir`.

**Utility:**
*   `getEnvironmentInfo()`: Provides information about the server's configuration.

*(For detailed input schemas, the LLM can typically inspect the tool or you can refer to the `index.mjs` tool definitions.)*

## Usage Examples with an LLM

After configuring Claude Desktop:

*   "Using `my-project-env`, create a Python script named `fibonacci.py` in the root of the project that calculates Fibonacci numbers up to n."
*   "With `my-project-env`, list all files in the `src` directory with details."
*   "Read lines 10 to 20 of `README.md` using `my-project-env`."
*   "Show me a unified diff between `app.js` and the following new version: [paste new code here] using `my-project-env`."
*   "Apply these changes to `app.js` and create a backup with `my-project-env`."
*   "Using `my-project-env`, execute the command `git status`."
*   "Search for the term 'ModelContextProtocol' in all `*.md` files within the project using `my-project-env`."
*   "Using `my-project-env`, create a file `src/utils.ts` with the content `export const add = (a: number, b: number): string => a + b;` then get diagnostics for `src/utils.ts`."
*   "With `my-project-env`, in the file `src/components/MyForm.vue` at line 25, character 10, what are the code completions?"
*   "Using `my-project-env`, find the definition of the `useState` hook used in `src/App.jsx` at line 7, character 15."
*   "Format the document `src/api/service.js` using `my-project-env`."

## Configuration via Environment Variables

When running the Docker container, you can set these environment variables using the `-e` flag in your `docker run` command (within `claude_desktop_config.json`):

*   `MCP_BASE_DIR`: (Default: `/app/project`) The internal directory in the container where operations occur. This is typically mapped from your host via the `-v` volume mount.
*   `MCP_READ_ONLY_MODE`: (Default: `false`) Set to `true` to disable all write/delete/execute operations.
    *   Example: `-e MCP_READ_ONLY_MODE=true`
*   `MCP_COMMAND_TIMEOUT`: (Default: `30000` ms) Timeout for `executeCommand` in milliseconds.
    *   Example: `-e MCP_COMMAND_TIMEOUT=60000`

## Security Considerations

*   **Volume Mount Scope:** File access is strictly limited to the directory you mount into `/app/project` in the container.
*   **Path Validation:** The server validates all relative paths to ensure they resolve within the mounted `BASE_DIR`, preventing path traversal.
*   **Command Whitelisting:** `executeCommand` only permits commands explicitly defined in `src/config.mjs`.
*   **Read-Only Mode:** Provides an extra layer of safety for sensitive projects.
*   **Docker Isolation:** The server runs within a Docker container, separate from your host system's main processes.
*   **No Shell for `executeCommand`:** Uses `child_process.execFile`, which does not invoke a shell, reducing risks of shell injection from arguments.
*   **LSP Interaction:** Language Server Protocol interactions are managed by the MCP server; the LLM does not directly control LSP processes.

## Troubleshooting

*   **Claude Can't Find the MCP Server / "Connection Refused":**
    1.  Ensure Docker is running.
    2.  Verify the Docker image `filesystem-mcp-ex` was built successfully.
    3.  Double-check the `claude_desktop_config.json` for typos in the image name or command arguments.
    4.  Restart Claude Desktop after any configuration changes.
    5.  Check Claude Desktop logs for more specific error messages.
*   **Permissions Issues on Host (e.g., "Permission denied" when LLM tries to write):**
    1.  Ensure the directory you mounted from your host (e.g., `~/my-llm-projects/project-alpha`) has appropriate write permissions for the user running Docker, or for "everyone" if necessary (use with caution).
    2.  Files created by the container might be owned by `root` on the host. You might need `sudo` to edit them directly on the host or adjust their permissions. Docker Desktop on macOS/Windows often handles UID/GID mapping more smoothly.
*   **"Path not allowed" errors:**
    1.  Ensure all file paths provided to the LLM are relative to the root of your mounted project directory. Do not use absolute paths from your host system in prompts.
    2.  Avoid using `../` to attempt to navigate outside the project root.
*   **Command Not Found (for `docker run`):** Ensure Docker CLI is installed and in your system's PATH.
*   **LSP Tools Not Working:**
    1.  Verify the Docker image built correctly and includes the language server installations (check Docker build logs).
    2.  Ensure the file types you are targeting (`.js`, `.ts`, `.vue`) have corresponding LSPs installed in the Docker image and configured in `lspService.mjs`.
    3.  Check the MCP server logs (stderr from the Docker container) for any errors related to LSP process spawning or communication.
    4.  Ensure the project within `BASE_DIR` has necessary configuration files if LSPs depend on them (e.g., `tsconfig.json` for TypeScript projects).

## Project Structure

```
filesystem-mcp/
├── Dockerfile             # Docker container configuration
├── index.mjs              # Main MCP server entry point, tool definitions
├── package.json           # Node.js dependencies and project info
├── src/                   # Server logic
│   ├── config.mjs         # Server configuration (BASE_DIR, whitelists, etc.)
│   ├── handlers/          # Tool-specific handler functions
│   │   ├── commandOpsHandlers.mjs
│   │   ├── contentOpsHandlers.mjs
│   │   ├── fileOpsHandlers.mjs
│   │   ├── lspOpsHandlers.mjs     # LSP tool handlers
│   │   ├── projectCtxHandlers.mjs
│   │   └── utilityHandlers.mjs
│   ├── lsp/                   # LSP service logic
│   │   └── lspService.mjs         # Manages LSP processes and communication
│   └── utils/             # Utility functions
│       ├── fileUtils.mjs    # Path validation, FS helpers
│       ├── projectFacts.mjs # projectfacts.json management
│       └── security.mjs     # Command validation, sanitization
└── project-output/        # (Example) A directory you might create and mount```
*(The `project-output/` directory is just an example; you define your actual project directory on your host machine).*

## Contributing

Contributions, issues, and feature requests are welcome! Please feel free to submit a Pull Request or open an issue.

## License

MIT
