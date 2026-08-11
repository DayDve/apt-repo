# syntax=docker/dockerfile:1
FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    git meson ninja-build pkg-config gcc dpkg-dev ca-certificates \
    libwayland-dev libxkbcommon-dev libpixman-1-dev \
    wayland-protocols libdrm-dev libgbm-dev libssl-dev \
    libgnutls28-dev libgcrypt20-dev libsasl2-dev libjpeg-dev libpng-dev \
    liblzo2-dev zlib1g-dev libegl-dev libgles2-mesa-dev \
    libavcodec-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

# Fixes applied on top of upstream master:
# - gcrypt crypto backend (via libgcrypt20-dev) whose DES works on OpenSSL 3.x,
#   unlike the openssl backend (DES in the legacy provider is unavailable).
# - vncviewer.c segfault: RunAuthCommand dereferences *username even when
#   username=NULL (password-only VNC auth servers).
COPY wlvncc-fixes.patch /build/wlvncc-fixes.patch

RUN git clone --depth 1 https://github.com/any1/wlvncc.git && \
    git clone --depth 1 https://github.com/any1/aml.git wlvncc/subprojects/aml && \
    cd wlvncc && \
    git apply /build/wlvncc-fixes.patch

RUN cd wlvncc && \
    meson setup build --prefix=/usr && \
    ninja -C build

RUN mkdir -p /pkg/usr/bin /pkg/DEBIAN

RUN cp /build/wlvncc/build/wlvncc /pkg/usr/bin/

RUN strip --strip-unneeded /pkg/usr/bin/wlvncc

RUN cat <<EOF > /pkg/DEBIAN/control
Package: wlvncc
Version: ${APP_VERSION}
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Description: Wayland native VNC client
Depends: libc6, libdrm2, libwayland-client0, libwayland-cursor0, libxkbcommon0, libpixman-1-0, libgbm1, libgnutls30, libgcrypt20, libsasl2-2, libjpeg8, libpng16-16t64, liblzo2-2, zlib1g, libegl1, libgles2, libavcodec60, libavutil58
Installed-Size: $(du -sk /pkg | cut -f1)
EOF

RUN dpkg-deb --build /pkg "/wlvncc_${APP_VERSION}_amd64.deb"

FROM scratch AS output
COPY --from=builder /wlvncc_*.deb /
