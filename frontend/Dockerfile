FROM node:20-slim

WORKDIR /workspace

# Install dependencies first for better caching
COPY package.json package-lock.json* ./

RUN npm install

# Copy application files
COPY . .

# Expose Vite development server port
EXPOSE 5173

# Start the application in development mode
CMD ["npm", "run", "dev"]
