ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o "/bitwarden_${APP_VERSION}_amd64.deb" \
      "https://github.com/bitwarden/clients/releases/download/desktop-v${APP_VERSION}/Bitwarden-${APP_VERSION}-amd64.deb"

FROM scratch
COPY --from=download /bitwarden_*.deb /
