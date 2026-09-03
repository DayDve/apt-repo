ARG APP_VERSION

# --- Pattern A: Download pre-built .deb ---
FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /app.deb \
      "https://github.com/OWNER/REPO/releases/download/v${APP_VERSION}/package_${APP_VERSION}_amd64.deb"

FROM scratch AS output
COPY --from=download /app.deb /

# --- Pattern B: Build from source ---
# FROM ubuntu:24.04 AS builder
# RUN apt-get update && apt-get install --no-install-recommends -y \
#       build-essential git dpkg-dev ca-certificates && \
#     rm -rf /var/lib/apt/lists/*
# WORKDIR /build
# ARG DEBFULLNAME
# ARG DEBEMAIL
# ARG APP_VERSION
# RUN git clone https://github.com/OWNER/REPO.git .
# RUN make && mkdir -p /pkg/DEBIAN && \
#     cat <<EOF > /pkg/DEBIAN/control
# Package: myapp
# Version: $APP_VERSION
# Architecture: amd64
# Maintainer: ${DEBFULLNAME} <${DEBEMAIL}>
# Description: My awesome app.
# EOF
# RUN dpkg-deb --build /pkg /myapp_${APP_VERSION}_amd64.deb
# FROM scratch
# COPY --from=builder /myapp_*.deb /

# --- Pattern C: Rebuild upstream Debian source package (distro-suffixed) ---
# Use when upstream publishes .dsc + .debian.tar.xz with a distro suffix
# (e.g. ubuntu26.04.1, debian13.1). build.sh maps $distro → UPSTREAM_PKG_SUFFIX.
# FROM ubuntu:noble AS builder
# ARG APP_VERSION
# ARG UPSTREAM_PKG_SUFFIX
# RUN sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/ubuntu.sources \
#  && apt-get update \
#  && apt-get install -y --no-install-recommends \
#       curl ca-certificates build-essential dpkg-dev fakeroot
# RUN mkdir -p /src && cd /src \
#  && curl -fsSL -o "pkg_${APP_VERSION}.orig.tar.gz" \
#       "https://github.com/OWNER/REPO/releases/download/v${APP_VERSION}/pkg-${APP_VERSION}.tar.gz" \
#  && curl -fsSL -O \
#       "https://github.com/OWNER/REPO/releases/download/v${APP_VERSION}/pkg_${APP_VERSION}-1.${UPSTREAM_PKG_SUFFIX}.dsc" \
#  && curl -fsSL -O \
#       "https://github.com/OWNER/REPO/releases/download/v${APP_VERSION}/pkg_${APP_VERSION}-1.${UPSTREAM_PKG_SUFFIX}.debian.tar.xz" \
#  && dpkg-source -x "pkg_${APP_VERSION}-1.${UPSTREAM_PKG_SUFFIX}.dsc" \
#  && cd "pkg-${APP_VERSION}" \
#  && apt-get build-dep -y --no-install-recommends ./ \
#  && useradd -m build && chown -R build /src \
#  && su build -c "cd /src/pkg-${APP_VERSION} && dpkg-buildpackage -us -uc -b"
# FROM scratch AS output
# COPY --from=builder /pkg_*.deb /
