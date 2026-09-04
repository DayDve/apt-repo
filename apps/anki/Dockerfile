ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates zstd && \
    curl -fsSL -o /anki.tar.zst \
      "https://github.com/ankitects/anki/releases/download/${APP_VERSION}/anki-${APP_VERSION}-linux-x86_64.tar.zst" && \
    mkdir -p /extracted && \
    unzstd /anki.tar.zst -o /anki.tar && \
    tar -xf /anki.tar -C /extracted

FROM ubuntu:24.04 AS package
RUN apt-get update && \
    apt-get install --no-install-recommends -y dpkg && \
    rm -rf /var/lib/apt/lists/*

ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

WORKDIR /build

COPY --from=download /extracted /extracted

# Official layout: everything under /usr/share/anki, launcher symlinked to /usr/bin/anki.
# The "anki" binary is a Briefcase-packaged ELF launcher (not a script) that resolves
# its bundled Python/Qt runtime relative to $ORIGIN, so it must stay inside the folder.
RUN mkdir -p usr/share/anki && \
    cp -a /extracted/anki-linux/app usr/share/anki/ && \
    cp -a /extracted/anki-linux/app_packages usr/share/anki/ && \
    cp -a /extracted/anki-linux/python usr/share/anki/ && \
    cp /extracted/anki-linux/anki usr/share/anki/ && \
    cp /extracted/anki-linux/anki.1 usr/share/anki/ && \
    cp /extracted/anki-linux/anki.desktop usr/share/anki/ && \
    cp /extracted/anki-linux/anki.png usr/share/anki/ && \
    cp /extracted/anki-linux/anki.xml usr/share/anki/ && \
    cp /extracted/anki-linux/anki.xpm usr/share/anki/ && \
    cp /extracted/anki-linux/README.md usr/share/anki/

# launcher + desktop integration
RUN mkdir -p usr/bin usr/share/applications usr/share/man/man1 usr/share/pixmaps && \
    ln -s /usr/share/anki/anki usr/bin/anki && \
    cp usr/share/anki/anki.desktop usr/share/applications/ && \
    cp usr/share/anki/anki.png usr/share/pixmaps/ && \
    cp usr/share/anki/anki.xpm usr/share/pixmaps/ && \
    gzip -9 usr/share/anki/anki.1 && \
    mv usr/share/anki/anki.1.gz usr/share/man/man1/

# hicolor icon for KDE Discover DEP-11 (and the app launcher)
RUN mkdir -p usr/share/icons/hicolor/256x256/apps && \
    cp usr/share/anki/anki.png usr/share/icons/hicolor/256x256/apps/anki.png

RUN mkdir -p DEBIAN && \
    printf 'Package: anki\n\
Version: %s\n\
Section: education\n\
Priority: optional\n\
Architecture: amd64\n\
Maintainer: %s <%s>\n\
Depends: libxcb-xinerama0, libxcb-cursor0, libnss3, libxcb-icccm4, libxcb-keysyms1, libxcb-image0, libxcb-randr0, libxcb-render-util0, libxcb-shape0, libxcb-xkb1, libxcomposite1, libxcursor1, libxi6, libxkbcommon0, libxkbcommon-x11-0, libxrandr2, libxrender1, libxtst6, libdbus-1-3, libfontconfig1, libfreetype6, libgl1\n\
Description: Spaced repetition flashcard program\n\
 Anki is a program which makes remembering things easy. It is a free,\n\
 open-source program which intelligent flash cards make remembering things\n\
 easier. Anki is a spaced repetition system (SRS), which allows you to\n\
 control your learning. It is smart about scheduling, so you can spend\n\
 your time working on exactly the cards you are struggling with.\n' \
    "${APP_VERSION}" "${DEBFULLNAME}" "${DEBEMAIL}" > DEBIAN/control

RUN mkdir -p /out && dpkg-deb --root-owner-group --build . /out/anki_${APP_VERSION}_amd64.deb

FROM scratch
COPY --from=package /out/*.deb /
