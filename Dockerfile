# read the doc: https://huggingface.co/docs/hub/spaces-sdks-docker
# you will also find guides on how best to write your Dockerfile
FROM node:19 as builder-production

WORKDIR /app

COPY --link --chown=1000 pnpm-lock.yaml package.json ./

RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --prefer-frozen-lockfile

COPY --link --chown=1000 . .

RUN pnpm build

FROM node:19-slim

RUN npm install -g pm2

COPY --from=builder-production /app/node_modules /app/node_modules
COPY --link --chown=1000 package.json /app/package.json
COPY --from=builder-production /app/build /app/build

CMD pm2 start /app/build/index.js -i $CPU_CORES --no-daemon
