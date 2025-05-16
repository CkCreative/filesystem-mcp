FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json ./

# Install dependencies
RUN npm install

# Copy server code
COPY index.mjs ./

# Set environment variable for base directory
ENV MCP_BASE_DIR=/app/project

# Create the project directory
RUN mkdir -p /app/project

# Make the entry script executable
RUN chmod +x index.mjs

# Start MCP server
CMD ["node", "index.mjs"]
