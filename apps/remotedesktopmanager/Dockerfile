FROM alpine:latest AS download

ARG APP_VERSION

RUN apk add --no-cache curl ca-certificates

RUN curl -sLo "/remotedesktopmanager_${APP_VERSION}_amd64.deb" \
    "https://cdn.devolutions.net/download/Linux/RDM/${APP_VERSION}/RemoteDesktopManager_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=download /remotedesktopmanager_*.deb /
