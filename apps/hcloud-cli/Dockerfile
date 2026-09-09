ARG APP_VERSION
FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl && \
    curl -fsSL -o "/hcloud-cli_${APP_VERSION}_amd64.deb" \
      "https://github.com/hetznercloud/cli/releases/download/v${APP_VERSION}/hcloud-cli_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=download /hcloud-cli_*.deb /