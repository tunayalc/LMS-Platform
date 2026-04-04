FROM node:20-slim

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=development
ENV LMS_ENV_FILE=/app/.env.docker

CMD ["pnpm", "--filter", "@lms/api", "dev"]
