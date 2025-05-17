FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install dependencies
RUN npm install --omit=dev

# Install Language Servers and core TypeScript
RUN npm install -g typescript typescript-language-server
# @volar/vue-language-server vue-tsc
# Note: @volar/typescript-language-service is often a peer dep or used internally by volar
RUN ls -l /usr/local/bin

# Copy server code
COPY index.mjs ./
COPY src ./src/

# Set environment variable for base directory (can be overridden)
ENV MCP_BASE_DIR=/app/project
# Set read-only mode (false by default, can be overridden)
ENV MCP_READ_ONLY_MODE=false
# Set command execution timeout (100 seconds by default, can be overridden)
ENV MCP_COMMAND_TIMEOUT=100000

# Create the project directory
RUN mkdir -p /app/project

# Make the entry script executable
RUN chmod +x index.mjs

# Start MCP server
CMD ["node", "index.mjs"]
