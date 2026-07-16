ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /rustdesk.deb \
      "https://github.com/rustdesk/rustdesk/releases/download/${APP_VERSION}/rustdesk-${APP_VERSION}-x86_64.deb"

FROM scratch
COPY --from=download /rustdesk.deb /
