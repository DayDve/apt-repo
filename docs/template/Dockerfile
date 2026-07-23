ARG APP_VERSION

# --- Pattern A: Download pre-built .deb ---
FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /app.deb \
      "https://github.com/OWNER/REPO/releases/download/v${APP_VERSION}/package_${APP_VERSION}_amd64.deb"

FROM scratch AS output
COPY --from=download /app.deb /

# --- Pattern B: Build from source ---
# FROM ubuntu:24.04 AS builder
# RUN apt-get update && apt-get install --no-install-recommends -y \
#       build-essential git dpkg-dev ca-certificates && \
#     rm -rf /var/lib/apt/lists/*
# WORKDIR /build
# ARG DEBFULLNAME
# ARG DEBEMAIL
# ARG APP_VERSION
# RUN git clone https://github.com/OWNER/REPO.git .
# RUN make && mkdir -p /pkg/DEBIAN && \
#     cat <<EOF > /pkg/DEBIAN/control
# Package: myapp
# Version: $APP_VERSION
# Architecture: amd64
# Maintainer: ${DEBFULLNAME} <${DEBEMAIL}>
# Description: My awesome app.
# EOF
# RUN dpkg-deb --build /pkg /myapp_${APP_VERSION}_amd64.deb
# FROM scratch
# COPY --from=builder /myapp_*.deb /
