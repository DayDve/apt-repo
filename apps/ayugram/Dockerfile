FROM ghcr.io/telegramdesktop/tdesktop/centos_env:latest AS build

USER root

ARG APP_VERSION

RUN yum install -y ccache

WORKDIR /build

RUN git clone --depth 1 --branch dev \
    https://github.com/AyuGram/AyuGramDesktop.git src \
 && cd src \
 && git submodule update --init --recursive --depth 1

RUN chown -R user:user /build

RUN --mount=type=cache,target=/build/ccache,sharing=locked \
    mkdir -p /build/ccache && \
    chown -R user:user /build/ccache && \
    chmod -R 777 /build/ccache && \
    su user -c ' \
      export CCACHE_DIR=/build/ccache && \
      export CCACHE_MAXSIZE=10G && \
      export CCACHE_COMPRESS=1 && \
      export CCACHE_SLOPPINESS=include_file_ctime,include_file_mtime,pch_defines,time_macros && \
      export CCACHE_COMPILERCHECK=content && \
      export CCACHE_BASEDIR=/build && \
      export CCACHE_NOHASHDIR=1 && \
      export CCACHE_CPP2=1 && \
      cd /build/src/Telegram && \
      ./configure.sh \
        -D TDESKTOP_API_ID=2040 \
        -D TDESKTOP_API_HASH=b18441a1ff607e10a989891a5462e627 \
        -D CMAKE_C_COMPILER_LAUNCHER=ccache \
        -D CMAKE_CXX_COMPILER_LAUNCHER=ccache && \
      cmake --build ../out --config Release -j$(nproc) \
    '

RUN test -f src/out/Release/AyuGram

FROM ubuntu:24.04 AS package

RUN apt-get update \
 && apt-get install --no-install-recommends -y dpkg-dev e2fsprogs \
 && rm -rf /var/lib/apt/lists/*

ARG DEBFULLNAME
ARG DEBEMAIL
ARG APP_VERSION

WORKDIR /build

COPY --from=build /build/src/out/Release/AyuGram usr/bin/aygram-desktop
COPY --from=build /build/src/.github/AyuGram.png \
    usr/share/icons/hicolor/512x512/apps/com.ayugram.desktop.png

RUN mkdir -p DEBIAN usr/share/applications usr/share/dbus-1/services

RUN printf 'Package: ayugram\n\
Version: %s\n\
Section: net\n\
Priority: optional\n\
Architecture: amd64\n\
Maintainer: %s <%s>\n\
Depends: libc6, ca-certificates\n\
Description: AyuGram Desktop\n\
 ToS breaking Telegram client with enhanced features.\n' \
    "${APP_VERSION}" "${DEBFULLNAME}" "${DEBEMAIL}" > DEBIAN/control

RUN printf '#!/bin/sh\n\
set -e\n\
chmod +x /usr/share/applications/com.ayugram.desktop\n\
chattr +i /usr/share/applications/com.ayugram.desktop\n\
exit 0\n' > DEBIAN/postinst && chmod 755 DEBIAN/postinst

RUN printf '#!/bin/sh\n\
set -e\n\
chattr -i /usr/share/applications/com.ayugram.desktop 2>/dev/null || true\n\
exit 0\n' > DEBIAN/prerm && chmod 755 DEBIAN/prerm

RUN printf '[Desktop Entry]\n\
Name=AyuGram Desktop\n\
Comment=Desktop version of AyuGram - ToS breaking Telegram client\n\
Comment[ru_RU]=Альтернативный мессенджер для Telegram\n\
Exec=env DESKTOPINTEGRATION=1 /usr/bin/aygram-desktop -- %%u\n\
Icon=com.ayugram.desktop\n\
Terminal=false\n\
StartupWMClass=AyuGram\n\
Type=Application\n\
Categories=Chat;Network;InstantMessaging;Qt;\n\
MimeType=x-scheme-handler/tg;x-scheme-handler/tonsite;\n\
Keywords=tg;chat;im;messaging;messenger;sms;telegram;tdesktop;\n\
Actions=quit;\n\
DBusActivatable=true\n\
SingleMainWindow=true\n\
X-GNOME-UsesNotifications=true\n\
X-GNOME-SingleWindow=true\n\
\n\
[Desktop Action quit]\n\
Exec=env DESKTOPINTEGRATION=1 /usr/bin/aygram-desktop -quit\n\
Name=Quit AyuGram\n\
Icon=application-exit\n' > usr/share/applications/com.ayugram.desktop

RUN printf '[D-BUS Service]\n\
Name=com.ayugram.desktop\n\
Exec=/usr/bin/aygram-desktop\n' > usr/share/dbus-1/services/com.ayugram.service

RUN mkdir -p /out && dpkg-deb --root-owner-group --build . /out/ayugram_${APP_VERSION}_amd64.deb

FROM scratch
COPY --from=package /out/*.deb /
