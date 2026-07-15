ARG APP_VERSION
FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl
RUN curl -fsSL -o /tmp/rclone.deb \
  "https://github.com/rclone/rclone/releases/download/v${APP_VERSION}/rclone-v${APP_VERSION}-linux-amd64.deb"

FROM scratch
COPY --from=download /tmp/rclone.deb /
