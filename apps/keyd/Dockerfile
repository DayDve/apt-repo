FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates build-essential git dpkg-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone https://github.com/rvaiya/keyd.git .

RUN make

ARG DEBFULLNAME
ARG DEBEMAIL

RUN VERSION=$(git describe --tags --abbrev=0 | tr -d 'v') && \
    DESTDIR=/pkg && \
    make install DESTDIR=$DESTDIR PREFIX=/usr FORCE_SYSTEMD=1 && \
    mkdir -p $DESTDIR/DEBIAN && \
    cat <<EOF > $DESTDIR/DEBIAN/control
Package: keyd
Version: $VERSION
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Description: A key remapping daemon for linux.
Depends: libc6, systemd
Installed-Size: $(du -sk $DESTDIR | cut -f1)
EOF

RUN cat <<'EOF' > /pkg/DEBIAN/postinst
#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    if ! getent group keyd > /dev/null; then
        groupadd --system keyd || true
    fi
    systemctl daemon-reload || true
    systemctl enable keyd || true
    systemctl restart keyd || true
fi
EOF
RUN chmod 755 /pkg/DEBIAN/postinst

RUN cat <<'EOF' > /pkg/DEBIAN/prerm
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "deconfigure" ]; then
    systemctl disable --now keyd || true
fi
EOF
RUN chmod 755 /pkg/DEBIAN/prerm

RUN VERSION=$(git describe --tags --abbrev=0 | tr -d 'v') && \
    dpkg-deb --build /pkg "/keyd_${VERSION}_amd64.deb"

FROM scratch
COPY --from=builder /keyd_*.deb /
