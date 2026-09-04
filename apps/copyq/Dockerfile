ARG APP_VERSION

FROM ubuntu:24.04 AS build
ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

ENV DEBIAN_FRONTEND=noninteractive

# KDE Neon user-edition repo ships Qt 6.11 (Ubuntu 24.04 stock Qt is 6.4);
# CopyQ 16 requires Qt >= 6.2 but is developed against current Qt. Same repo
# wiring as btrfs-assistant.
RUN apt-get update && apt-get install -y -qq curl ca-certificates && \
    install -d /etc/apt/keyrings && \
    curl -fsSL https://archive.neon.kde.org/public.key \
      -o /etc/apt/keyrings/neon-archive-keyring.asc && \
    echo "deb [signed-by=/etc/apt/keyrings/neon-archive-keyring.asc] \
      http://archive.neon.kde.org/user noble main" \
      > /etc/apt/sources.list.d/neon.list && \
    apt-get update && apt-get install -y -qq \
      build-essential cmake curl dpkg-dev \
      qt6-base-dev qt6-tools-dev qt6-tools-dev-tools qt6-l10n-tools \
      qt6-declarative-dev qt6-svg-dev \
      libqca-qt6-2-dev qtkeychain-qt6-dev \
      extra-cmake-modules kf6-knotifications-dev kf6-kstatusnotifieritem-dev \
      libkf6guiaddons-dev libminiaudio-dev && \
    rm -rf /var/lib/apt/lists/*

# Full source from the GitHub release tarball asset (no prebuilt .deb exists).
RUN curl -fsSL -o /copyq-src.tar.gz \
      "https://github.com/hluk/CopyQ/releases/download/v${APP_VERSION}/CopyQ-${APP_VERSION}.tar.gz" \
 && mkdir /src \
 && tar -xzf /copyq-src.tar.gz -C /src --strip-components=1

RUN cd /src && \
    cmake -B build \
      -DCMAKE_INSTALL_PREFIX=/usr \
      -DCMAKE_BUILD_TYPE=Release \
      -DWITH_PLUGINS=ON \
      -DWITH_AUDIO=ON \
      -DWITH_GNOME_CLIPBOARD_EXTENSION=ON && \
    cmake --build build -j$(nproc)

RUN cd /src && DESTDIR=/pkg cmake --install build

# Ubuntu split: the main binary + data go into copyq, all plugin modules go
# into the sibling copyq-plugins package.
RUN rm -rf /pkg/usr/lib/copyq/plugins && \
    DEPS="$(dpkg-shlibdeps -O /pkg/usr/bin/copyq 2>/dev/null | sed 's/^shlibs:Depends=//')" && \
    [ -n "$DEPS" ] || DEPS="libc6, libgcc-s1, libstdc++6, libqt6core6t64, libqt6dbus6t64, libqt6gui6t64, libqt6network6t64, libqt6qml6, libqt6svg6, libqt6widgets6t64, libqt6xml6" && \
    mkdir -p /pkg/DEBIAN && \
    cat <<EOF > /pkg/DEBIAN/control
Package: copyq
Version: ${APP_VERSION}
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Depends: ${DEPS}, libqca-qt6-2, libqt6keychain1, libkf6guiaddons6, libkf6notifications6, kf6-kstatusnotifieritem
Recommends: copyq-plugins (= ${APP_VERSION}), qt6-wayland
Description: Advanced clipboard manager with editing and scripting
 CopyQ monitors the system clipboard and saves its content in
 customized tabs. Saved clipboard can be later copied and pasted
 directly into any application, with editing and scripting support.
Homepage: https://hluk.github.io/CopyQ/
Installed-Size: $(du -sk /pkg | cut -f1)
EOF

RUN dpkg-deb --root-owner-group --build /pkg "/copyq_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=build /copyq_*.deb /