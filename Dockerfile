# read the doc: https://huggingface.co/docs/hub/spaces-sdks-docker
# you will also find guides on how best to write your Dockerfile
FROM oven/bun:latest as builder-production

WORKDIR /app

COPY --link --chown=1000 . .

RUN bun install --frozen-lockfile

RUN bun run build

CMD bun ./build/index.js