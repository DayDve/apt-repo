# syntax=docker/dockerfile:1
FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies for compilation and packaging
RUN apt-get update && apt-get install -y \
    git meson ninja-build pkg-config gcc dpkg-dev ca-certificates \
    libwayland-dev libxkbcommon-dev libpixman-1-dev \
    wayland-protocols libdrm-dev libgbm-dev libssl-dev \
    libgnutls28-dev libsasl2-dev libjpeg-dev libpng-dev \
    liblzo2-dev zlib1g-dev libegl-dev libgles2-mesa-dev \
    libavcodec-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

# Clone wlvncc and its dependency aml
RUN git clone --depth 1 https://github.com/any1/wlvncc.git && \
    git clone --depth 1 https://github.com/any1/aml.git wlvncc/subprojects/aml

# Compile wlvncc
RUN cd wlvncc && \
    meson setup build --prefix=/usr && \
    ninja -C build

# Prepare the Debian package directory structure
RUN mkdir -p /pkg/usr/bin /pkg/DEBIAN

# Copy the compiled binary
RUN cp /build/wlvncc/build/wlvncc /pkg/usr/bin/

# Strip binary to reduce size
RUN strip --strip-unneeded /pkg/usr/bin/wlvncc

# Generate the control file with target runtime dependencies
RUN cat <<EOF > /pkg/DEBIAN/control
Package: wlvncc
Version: ${APP_VERSION}
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Description: Wayland native VNC client
Depends: libc6, libwayland-client0, libxkbcommon0, libpixman-1-0, libgbm1, libssl3, libgnutls30, libsasl2-2, libjpeg8, libpng16-16t64, liblzo2-2, zlib1g, libegl1, libgles2, libavcodec60
Installed-Size: $(du -sk /pkg | cut -f1)
EOF

# Build the .deb package
RUN dpkg-deb --build /pkg "/wlvncc_${APP_VERSION}_amd64.deb"

# Export the .deb package
FROM scratch AS output
COPY --from=builder /wlvncc_*.deb /
