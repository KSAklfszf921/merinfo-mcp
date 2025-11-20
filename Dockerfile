# Use Playwright's official image with pre-installed browsers
FROM mcr.microsoft.com/playwright:v1.48.2-noble

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY src ./src
COPY scripts ./scripts

# Build TypeScript
RUN npm run build

# Remove devDependencies after build
RUN npm prune --production

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/merinfo.db

# Start the streamable HTTP server
CMD ["npm", "run", "start:streamable"]
