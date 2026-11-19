ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o "/obsidian_${APP_VERSION}_amd64.deb" \
      "https://github.com/obsidianmd/obsidian-releases/releases/download/v${APP_VERSION}/obsidian_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=download /obsidian_*.deb /
