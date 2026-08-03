ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /mc6-data_${APP_VERSION}-1_all.deb \
      "https://github.com/ilia-maslakov/mcdev/releases/download/v${APP_VERSION}/mc6-data_${APP_VERSION}-1_all.deb"

FROM scratch AS output
COPY --from=download /mc6-data_*.deb /
