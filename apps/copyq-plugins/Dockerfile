ARG APP_VERSION

FROM ubuntu:24.04 AS build
ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

ENV DEBIAN_FRONTEND=noninteractive

# Same KDE Neon Qt 6.11 toolchain as the copyq package (the two are built
# from the identical source tree and version-locked to the same tag).
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

# Ship only the plugin modules here; the binary, icons and data live in copyq.
RUN find /pkg -type f ! -path '/pkg/usr/lib/copyq/plugins/*' -delete && \
    find /pkg -type d -empty -delete && \
    DEPS="$(dpkg-shlibdeps -O /pkg/usr/lib/copyq/plugins/*.so 2>/dev/null | sed 's/^shlibs:Depends=//')" && \
    [ -n "$DEPS" ] || DEPS="libc6, libgcc-s1, libstdc++6, libqt6core6t64, libqt6gui6t64, libqt6widgets6t64" && \
    mkdir -p /pkg/DEBIAN && \
    cat <<EOF > /pkg/DEBIAN/control
Package: copyq-plugins
Version: ${APP_VERSION}
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Depends: copyq (= ${APP_VERSION}), ${DEPS}
Description: Advanced clipboard manager with editing and scripting (plugins)
 Dynamically loaded plugins for CopyQ: text and rich-text items,
 image thumbnails, notes, pinned and tagged items, encrypted items,
 vim-like editing and advanced clipboard synchronization.
Homepage: https://hluk.github.io/CopyQ/
Installed-Size: $(du -sk /pkg | cut -f1)
EOF

RUN dpkg-deb --root-owner-group --build /pkg "/copyq-plugins_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=build /copyq-plugins_*.deb /