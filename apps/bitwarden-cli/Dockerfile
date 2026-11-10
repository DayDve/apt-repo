ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates unzip && \
    curl -fsSL -o /bw.zip \
      "https://github.com/bitwarden/clients/releases/download/cli-v${APP_VERSION}/bw-oss-linux-${APP_VERSION}.zip" && \
    mkdir -p /extracted && \
    unzip -q /bw.zip -d /extracted && \
    chmod 0755 /extracted/bw

FROM ubuntu:24.04 AS package
RUN apt-get update && \
    apt-get install --no-install-recommends -y dpkg && \
    rm -rf /var/lib/apt/lists/*

ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

WORKDIR /build

# Single self-contained binary (Node.js bundled via pkg). Must not be stripped.
COPY --from=download /extracted/bw usr/bin/bw

RUN mkdir -p DEBIAN && \
    printf 'Package: bitwarden-cli\n\
Version: %s\n\
Section: utils\n\
Priority: optional\n\
Architecture: amd64\n\
Maintainer: %s <%s>\n\
Depends: libc6, libstdc++6, libgcc-s1\n\
Homepage: https://bitwarden.com\n\
Description: Bitwarden password manager command-line client\n\
 The Bitwarden CLI (bw) provides full access to a Bitwarden vault\n\
 from the terminal. Open source (OSS) build.\n' \
    "${APP_VERSION}" "${DEBFULLNAME}" "${DEBEMAIL}" > DEBIAN/control

RUN mkdir -p /out && dpkg-deb --root-owner-group --build . /out/bitwarden-cli_${APP_VERSION}_amd64.deb

FROM scratch
COPY --from=package /out/*.deb /
