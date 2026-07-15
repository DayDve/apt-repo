ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN V="${APP_VERSION%.repack}" && \
    apk add --no-cache curl && \
    curl -fsSL -o /tmp/wps-office.deb \
      "https://github.com/Rongronggg9/wps-office-repack/releases/download/v${V}/wps-office_${V}.AK.preread.sw+prefixed+fcitx5xwayland_amd64.deb"

FROM scratch
COPY --from=download /tmp/wps-office.deb /
