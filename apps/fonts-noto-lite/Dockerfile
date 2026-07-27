ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl
RUN curl -fsSL -o /fonts-noto-lite.deb \
  "https://github.com/DayDve/fonts-noto-lite/releases/download/v${APP_VERSION}/fonts-noto-lite.deb"

FROM scratch
COPY --from=download /fonts-noto-lite.deb /
