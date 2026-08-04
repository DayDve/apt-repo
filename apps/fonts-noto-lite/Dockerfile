ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl
RUN curl -fsSL -o /fonts-noto-lite.deb \
  "https://github.com/DayDve/fonts-noto-lite/releases/download/v${APP_VERSION}/fonts-noto-lite.deb" \
  && mv /fonts-noto-lite.deb "/fonts-noto-lite_${APP_VERSION}_all.deb"

FROM scratch
COPY --from=download /fonts-noto-lite*.deb /
