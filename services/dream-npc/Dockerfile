FROM node:22-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json ./

RUN npm install --production=false

COPY src/ ./src/
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npx", "tsx", "src/index.ts"]
