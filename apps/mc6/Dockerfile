ARG APP_VERSION

FROM ubuntu:noble AS builder
ARG APP_VERSION
ENV DEBIAN_FRONTEND=noninteractive

# Enable deb-src for apt-get build-dep (universe is already in the base image).
RUN sed -i 's/^Types: deb$/Types: deb deb-src/' /etc/apt/sources.list.d/ubuntu.sources \
 && apt-get update \
 && apt-get install -y --no-install-recommends \
      curl ca-certificates build-essential dpkg-dev fakeroot

# Rebuild the exact Debian source package upstream publishes: orig tarball,
# dsc and debian.tar.xz come from the release assets. dpkg-source -x verifies
# their checksums against the dsc.
RUN mkdir -p /src && cd /src \
 && curl -fsSL -o "mc6_${APP_VERSION}.orig.tar.gz" \
      "https://github.com/ilia-maslakov/mcdev/releases/download/v${APP_VERSION}/mc6-${APP_VERSION}.tar.gz" \
 && curl -fsSL -O \
      "https://github.com/ilia-maslakov/mcdev/releases/download/v${APP_VERSION}/mc6_${APP_VERSION}-1.dsc" \
 && curl -fsSL -O \
      "https://github.com/ilia-maslakov/mcdev/releases/download/v${APP_VERSION}/mc6_${APP_VERSION}-1.debian.tar.xz" \
 && dpkg-source -x "mc6_${APP_VERSION}-1.dsc" \
 && cd "mc6-${APP_VERSION}" \
 && apt-get build-dep -y --no-install-recommends ./ \
 && useradd -m build \
 && chown -R build /src \
 && su build -c "cd /src/mc6-${APP_VERSION} && dpkg-buildpackage -us -uc -b" \
 && cp "/src/mc6_${APP_VERSION}-1_amd64.deb" /

FROM scratch AS output
COPY --from=builder /mc6_*.deb /
