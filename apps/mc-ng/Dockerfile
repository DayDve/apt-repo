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
    if [ -s /tmp/changelog ]; then \
      printf 'mc-ng (%s-1) noble; urgency=low\n\n' "$APP_VERSION" > $DESTDIR/DEBIAN/changelog && \
      sed 's/^/  * /' /tmp/changelog >> $DESTDIR/DEBIAN/changelog && \
      printf '\n -- %s <%s>  %s\n' \
        "${DEBFULLNAME:-Unknown}" "${DEBEMAIL:-unknown@unknown}" \
        "$(date -R)" >> $DESTDIR/DEBIAN/changelog; \
    fi && \
    cat <<EOF > $DESTDIR/DEBIAN/control
Package: mc-ng
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
Conflicts: mc, mc-data
Replaces: mc, mc-data
Depends: libglib2.0-0t64, libslang2, libncurses6 | libncurses5,
         libssh2-1t64, libaspell15, e2fslibs
Installed-Size: $(du -sk $DESTDIR | cut -f1)
EOF

RUN dpkg-deb --build /pkg "/mc-ng_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=builder /mc-ng_*.deb /
