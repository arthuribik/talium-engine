# Use the official Node.js 22 image
FROM node:22.16

# Set working directory
WORKDIR /usr/src/app

# Install pnpm via corepack
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfiles and package info
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy Prisma schema files
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the codebase
COPY . .

# Build the app
RUN pnpm build

# Expose the port
EXPOSE 5103

# Run Prisma migrations and start the app
CMD ["sh", "-c", "npx prisma migrate deploy && pnpm start:prod"]