# Filesystem MCP Server for Claude

A Model Context Protocol (MCP) server that enables Claude to interact with your local filesystem in a secure, controlled manner.

## Video Demo

[![Filesystem MCP Server Demo](https://img.youtube.com/vi/ZYOsaGRsmoQ/0.jpg)](https://youtu.be/ZYOsaGRsmoQ?si=Vq95bCNZZrhPxokE)
*Click the image above to watch the demo on YouTube*

## Overview

This project provides a Docker-based MCP server that allows Claude Desktop to perform filesystem operations such as creating, reading, and modifying files. It creates an isolated environment where Claude can manipulate files without compromising your system security.

## Features

- Create and modify files through Claude
- Read file contents with optional line range support
- View differences between existing files and Claude-generated content
- Execute whitelisted shell commands in a controlled environment
- Track file changes in a project facts file
- Docker isolation for added security

## Prerequisites

- Docker
- Claude Desktop app
- Docker volume mounting permissions

## Quick Start

### 1. Clone or download this repository

```bash
git clone https://github.com/CkCreative/filesystem-mcp.git
cd filesystem-mcp
```

### 2. Build the Docker image

```bash
docker build -t filesystem-mcp .
```

### 3. Create output directory

```bash
mkdir -p project-output
```

### 4. Configure Claude Desktop

1. Open Claude Desktop
2. Go to Settings → Developer
3. Click "Edit Config" to open your `claude_desktop_config.json` file
4. Add the following configuration:

```json
{
  "mcpServers": {
    "filesystem-mcp": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-v", "/ABSOLUTE/PATH/TO/YOUR/project-output:/app/project",
        "filesystem-mcp"
      ]
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/YOUR/` with the absolute path to your project directory.

5. Save the file and restart Claude Desktop

## Available Tools

After connecting Claude to the MCP server, the following tools become available:

### createFile
Creates a new file with specified content.

### readFile
Reads file content, optionally by line range.

### diffWithLLM
Compares an existing file with LLM-generated content.

### applyLLMChanges
Applies LLM-generated content to a file.

### getProjectFacts
Gets the project facts file content (tracks changes).

### updateProjectFacts
Updates the project facts file with a new entry.

### executeCommand
Executes a whitelisted command (git, grep, find, ls, cat, diff, mkdir, rm, cp, mv).

## Usage Examples

Once you've configured Claude Desktop to use the MCP server, you can ask Claude to:

```
Create a Python script that calculates Fibonacci numbers in the project-output folder.
```

```
Read the content of hello.txt from the project folder.
```

```
Show me a diff between the current version of app.js and this improved version: [paste code]
```

```
Create a simple web project with HTML, CSS, and JavaScript files.
```

## Security Considerations

- Files are only accessible within the mounted volume
- Shell command execution is limited to a whitelist of safe commands
- Path traversal attacks are prevented by path normalization
- Docker container runs with minimal privileges

## Troubleshooting

### Permissions Issues

If you encounter permissions errors:

1. Ensure Docker has access to the volume you're mounting
2. Check that the absolute path in your configuration is correct
3. Verify that Docker Desktop has file sharing enabled for the directory

### Claude Can't Find the MCP Server

1. Restart Claude Desktop after configuration changes
2. Check Claude Desktop logs for errors
3. Ensure the Docker image is built correctly

### Docker Command Not Found

Ensure Docker is installed and in your PATH.

## Project Structure

```
filesystem-mcp/
├── Dockerfile             # Container configuration
├── index.mjs              # MCP server implementation
├── package.json           # Node.js dependencies
└── project-output/        # Mounted volume where files are stored
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
