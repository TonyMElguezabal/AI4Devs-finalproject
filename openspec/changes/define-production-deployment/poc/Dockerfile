# JOS-194 proof of concept — throwaway image for option B+ (design § Execution Record §3).
# Build context: the repository root.  docker build --platform linux/amd64 -f <this file> .
ARG NODE_VERSION=26.4.0
FROM node:${NODE_VERSION}-bookworm-slim

# Pinned to what the Cloudflare example uses (tigrisfs) and a known-good Litestream; newer releases exist (litestream 0.5.x, tigrisfs 1.2.4) and are a follow-up evaluation.
ARG LITESTREAM_VERSION=0.3.13
ARG TIGRISFS_VERSION=1.2.1

# Stand-in: the code hard-codes /opt/homebrew/bin/ffmpeg (ffmpegAssemblyTool.ts:13-14).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fuse ca-certificates curl socat tini \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /opt/homebrew/bin \
 && ln -s /usr/bin/ffmpeg /opt/homebrew/bin/ffmpeg \
 && ln -s /usr/bin/ffprobe /opt/homebrew/bin/ffprobe

RUN ARCH="$(dpkg --print-architecture)" \
 && curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-${ARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin litestream \
 && curl -fsSL "https://github.com/tigrisdata/tigrisfs/releases/download/v${TIGRISFS_VERSION}/tigrisfs_${TIGRISFS_VERSION}_linux_${ARCH}.tar.gz" \
      | tar -xz -C /usr/local/bin tigrisfs

WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund
COPY backend/src backend/src
COPY backend/public backend/public

COPY openspec/changes/define-production-deployment/poc/preload.ts \
     openspec/changes/define-production-deployment/poc/entrypoint.sh \
     openspec/changes/define-production-deployment/poc/litestream.yml \
     /app/poc/
RUN chmod +x /app/poc/entrypoint.sh \
 && ffmpeg -loglevel error -f lavfi -i testsrc=size=1920x1088:rate=24 -t 1 -pix_fmt yuv420p -c:v libx264 /app/poc/clip.mp4

ENV NODE_ENV=production \
    PORT=3100 \
    BACKEND_SRC=/app/backend/src \
    DB_PATH=/var/lib/vid4you/skeleton.sqlite \
    PROJECTS_ROOT=/mnt/r2/projects

EXPOSE 8080
# PoC-only uptime probe (preload.ts); Cloudflare routes only EXPOSEd ports.
EXPOSE 8081
ENTRYPOINT ["/usr/bin/tini", "--", "/app/poc/entrypoint.sh"]
