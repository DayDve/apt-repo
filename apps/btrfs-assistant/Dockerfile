FROM ubuntu:24.04 AS build
ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y -qq \
    build-essential cmake git dpkg-dev \
    qt6-base-dev qt6-tools-dev qt6-tools-dev-tools qt6-l10n-tools \
    libbtrfsutil-dev pkg-config && \
    rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${APP_VERSION}" \
    https://gitlab.com/btrfs-assistant/btrfs-assistant.git /src

RUN cd /src && \
    cmake -B build -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_BUILD_TYPE=Release && \
    cmake --build build -j$(nproc)

RUN cd /src && \
    DESTDIR=/pkg cmake --install build && \
    mkdir -p /pkg/DEBIAN && \
    cat <<EOF > /pkg/DEBIAN/control
Package: btrfs-assistant
Version: ${APP_VERSION}
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Description: GUI management tool for Btrfs filesystem
 A Qt6-based tool for managing Btrfs filesystems, including
 subvolumes, snapshots (Snapper/Timeshift), scrub, and balance operations.
Depends: libc6, libbtrfsutil1t64, btrfs-progs, libqt6core6t64, libqt6gui6t64, libqt6widgets6t64, libqt6dbus6t64, libgl1, libegl1, libqt6svg6
Installed-Size: $(du -sk /pkg | cut -f1)
EOF

RUN dpkg-deb --root-owner-group --build /pkg "/btrfs-assistant_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=build /btrfs-assistant_*.deb /
