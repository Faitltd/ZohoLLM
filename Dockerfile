# Use Node.js 18 as base image
FROM node:18-slim

# Install Python and pip for ChromaDB
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Create Python virtual environment and install ChromaDB
RUN python3 -m venv /app/venv
RUN /app/venv/bin/pip install chromadb

# Copy application code
COPY . .

# Create a startup script
RUN echo '#!/bin/bash\n\
# Start ChromaDB in background\n\
/app/venv/bin/chroma run --host 0.0.0.0 --port 8000 &\n\
\n\
# Wait for ChromaDB to start\n\
sleep 5\n\
\n\
# Start the Node.js application\n\
npm start' > /app/start.sh

RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 3000 8000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["/app/start.sh"]
