ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates tar && \
    curl -fsSL -o /scrcpy.tar.gz \
      "https://github.com/Genymobile/scrcpy/releases/download/v${APP_VERSION}/scrcpy-linux-x86_64-v${APP_VERSION}.tar.gz" && \
    mkdir -p /extracted && \
    tar -xzf /scrcpy.tar.gz -C /extracted && \
    mv /extracted/scrcpy-linux-x86_64-v${APP_VERSION}/* /extracted/

FROM ubuntu:24.04 AS package
RUN apt-get update && \
    apt-get install --no-install-recommends -y dpkg gzip && \
    rm -rf /var/lib/apt/lists/*

ARG APP_VERSION
ARG DEBFULLNAME
ARG DEBEMAIL

WORKDIR /build

COPY --from=download /extracted/scrcpy usr/bin/scrcpy
COPY --from=download /extracted/scrcpy-server usr/share/scrcpy/scrcpy-server
COPY --from=download /extracted/scrcpy.png usr/share/icons/hicolor/256x256/apps/scrcpy.png
COPY --from=download /extracted/scrcpy.1 usr/share/man/man1/scrcpy.1
COPY --from=download /extracted/LICENSE usr/share/doc/scrcpy/LICENSE

RUN gzip -9 usr/share/man/man1/scrcpy.1

RUN mkdir -p DEBIAN usr/share/applications && \
    printf 'Package: scrcpy\n\
Version: %s\n\
Section: universe/utils\n\
Priority: optional\n\
Architecture: amd64\n\
Maintainer: %s <%s>\n\
Depends: libsdl2-2.0-0, adb\n\
Conflicts: scrcpy-server\n\
Replaces: scrcpy-server\n\
Description: Mirror and control Android devices via USB/TCP\n' \
    "${APP_VERSION}" "${DEBFULLNAME}" "${DEBEMAIL}" > DEBIAN/control

RUN cat > usr/share/applications/scrcpy.desktop <<'EOF'
[Desktop Entry]
Name=scrcpy
GenericName=Android Remote Control
Comment=Display and control your Android device
Exec=/bin/sh -c "\"\$SHELL\" -i -c scrcpy"
Icon=scrcpy
Terminal=false
Type=Application
Categories=Utility;RemoteAccess;
StartupNotify=false
EOF

RUN cat > usr/share/applications/scrcpy-console.desktop <<'EOF'
[Desktop Entry]
Name=scrcpy (console)
GenericName=Android Remote Control
Comment=Display and control your Android device
Exec=/bin/bash --norc --noprofile -i -c "\"\$SHELL\" -i -c scrcpy || read -p 'Press Enter to quit...'"
Icon=scrcpy
Terminal=true
Type=Application
Categories=Utility;RemoteAccess;
StartupNotify=false
EOF

RUN mkdir -p /out && dpkg-deb --root-owner-group --build . /out/scrcpy_${APP_VERSION}_amd64.deb

FROM scratch
COPY --from=package /out/*.deb /
