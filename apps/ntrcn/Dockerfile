ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o "/ntrcn_${APP_VERSION}_all.deb" \
      "https://github.com/DayDve/ntrcn/releases/download/v${APP_VERSION}/ntrcn_${APP_VERSION}_all.deb"

FROM scratch
COPY --from=download /ntrcn_*.deb /
