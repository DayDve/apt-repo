FROM ubuntu:24.04 AS builder

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates git make dpkg-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone https://github.com/Antynea/grub-btrfs.git .

ARG DEBFULLNAME
ARG DEBEMAIL

RUN VERSION=$(git describe --tags --abbrev=0 | tr -d 'v') && \
    DESTDIR=/pkg && \
    make install DESTDIR=$DESTDIR && \
    mkdir -p $DESTDIR/DEBIAN && \
    cat <<EOF > $DESTDIR/DEBIAN/control
Package: grub-btrfs
Version: $VERSION
Architecture: amd64
Maintainer: ${DEBFULLNAME:-Unknown} <${DEBEMAIL:-unknown@unknown}>
Description: Grub btrfs snapshot boot manager.
Depends: inotify-tools, gawk
Installed-Size: $(du -sk $DESTDIR | cut -f1)
EOF

RUN cat <<'EOF' > /pkg/DEBIAN/conffiles
/etc/default/grub-btrfs/config
/etc/grub.d/41_snapshots-btrfs
EOF

RUN cat <<'EOF' > /pkg/DEBIAN/postinst
#!/bin/sh
set -e
if [ "$1" = "configure" ]; then
    if [ -x /usr/sbin/update-grub ]; then
        update-grub || true
    fi
fi
EOF
RUN chmod 755 /pkg/DEBIAN/postinst

RUN cat <<'EOF' > /pkg/DEBIAN/prerm
#!/bin/sh
set -e
if [ "$1" = "remove" ] || [ "$1" = "deconfigure" ]; then
    systemctl disable --now grub-btrfsd || true
fi
EOF
RUN chmod 755 /pkg/DEBIAN/prerm

RUN VERSION=$(git describe --tags --abbrev=0 | tr -d 'v') && \
    dpkg-deb --build /pkg "/grub-btrfs_${VERSION}_amd64.deb"

FROM scratch
COPY --from=builder /grub-btrfs_*.deb /
