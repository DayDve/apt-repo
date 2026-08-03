ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /mc6-plugins_${APP_VERSION}-1_amd64.deb \
      "https://github.com/ilia-maslakov/mcdev/releases/download/v${APP_VERSION}/mc6-plugins_${APP_VERSION}-1_amd64.deb"

FROM scratch AS output
COPY --from=download /mc6-plugins_*.deb /
