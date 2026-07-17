ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /winegui.deb \
      "https://github.com/winegui/WineGUI/releases/download/v${APP_VERSION}/WineGUI-v${APP_VERSION}-noble.deb"

FROM scratch
COPY --from=download /winegui.deb /