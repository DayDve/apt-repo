FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates build-essential git dpkg-dev autopoint automake autoconf \
    libtool pkg-config gettext libglib2.0-dev libslang2-dev libncurses-dev \
    libssh2-1-dev libaspell-dev e2fslibs-dev libgc-dev gpm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone --depth 1 https://github.com/ilia-maslakov/mcdev.git .

RUN ./autogen.sh && \
    ./configure --prefix=/usr --sysconfdir=/etc --disable-static && \
    make -j"$(nproc)"

ARG DEBFULLNAME
ARG DEBEMAIL
ARG APP_VERSION

COPY .changelog /tmp/changelog

RUN DESTDIR=/pkg && \
    make install DESTDIR=$DESTDIR && \
    mkdir -p $DESTDIR/DEBIAN && \
    mkdir -p $DESTDIR/usr/share/applications && \
    mkdir -p $DESTDIR/usr/share/metainfo && \
    printf '[Desktop Entry]\nType=Application\nName=mc6\nGenericName=File Manager\nComment=Heavily modified Midnight Commander fork with plugins\nExec=mc\nIcon=mc\nTerminal=true\nCategories=ConsoleOnly;Utility;FileManager;System;FileTools;\nKeywords=file manager;console;\n' > $DESTDIR/usr/share/applications/mc6.desktop && \
    printf '[Desktop Entry]\nType=Application\nName=mc6 editor\nComment=Edit text files\nExec=mcedit\nIcon=mc\nTerminal=true\nCategories=Utility;TextEditor;\nKeywords=editor;console;text;\n' > $DESTDIR/usr/share/applications/mc6edit.desktop && \
    printf '<?xml version="1.0" encoding="UTF-8"?>\n<component type="desktop-application">\n  <id>io.github.daydve.apt.mc6</id>\n  <metadata_license>CC0-1.0</metadata_license>\n  <project_license>GPL-3.0-or-later</project_license>\n  <name>mc6</name>\n  <summary>Heavily modified Midnight Commander fork with plugins, arcmc, and more</summary>\n  <description>\n    <p>A heavily modified fork of GNU Midnight Commander based on 4.8.33 with panel plugins (git, docker, k8s, mongodb, s3), arcmc archive manager, code folding, undo history, and more.</p>\n  </description>\n  <launchable type="desktop-id">mc6.desktop</launchable>\n  <provides>\n    <binary>mc</binary>\n  </provides>\n  <categories>\n    <category>System</category>\n    <category>FileTools</category>\n  </categories>\n</component>\n' > $DESTDIR/usr/share/metainfo/io.github.daydve.apt.mc6.metainfo.xml && \
    if [ -s /tmp/changelog ]; then \
      printf 'mc6 (%s-1) noble; urgency=low\n\n' "$APP_VERSION" > $DESTDIR/DEBIAN/changelog && \
      sed 's/^/  * /' /tmp/changelog >> $DESTDIR/DEBIAN/changelog && \
      printf '\n -- %s <%s>  %s\n' \
        "${DEBFULLNAME:-Unknown}" "${DEBEMAIL:-unknown@unknown}" \
        "$(date -R)" >> $DESTDIR/DEBIAN/changelog; \
    fi && \
    cat <<EOF > $DESTDIR/DEBIAN/control
Package: mc6
Version: ${APP_VERSION}
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Description: Heavily modified Midnight Commander fork with plugins, arcmc, and more
 A heavily modified fork of GNU Midnight Commander based on 4.8.33.
 The author does not expect all changes to be accepted upstream.
 Adds panel plugins (git, docker, k8s, mongodb, s3, ftp, sftp, samba, systemd),
 arcmc archive manager, code folding, undo history, macro explorer,
 structured tree viewer, grep-style filter, ANSI terminal replay,
 embedded terminal, and configurable panel view modes.
Conflicts: mc, mc-data, mc-plugins
Replaces: mc, mc-data, mc-plugins
Depends: libglib2.0-0t64, libslang2, libncurses6 | libncurses5,
         libssh2-1t64, libaspell15, e2fslibs
Installed-Size: $(du -sk $DESTDIR | cut -f1)
EOF

RUN dpkg-deb --build /pkg "/mc6_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=builder /mc6_*.deb /
