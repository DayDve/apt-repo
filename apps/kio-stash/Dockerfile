FROM alpine:latest AS download

ARG APP_VERSION

RUN apk add --no-cache curl && \
    curl -fsSL -o /kio-stash_${APP_VERSION}_amd64.deb \
    "https://github.com/DayDve/kio-stash/releases/download/v${APP_VERSION}/kio-stash_${APP_VERSION}_amd64.deb"

FROM scratch
COPY --from=download /kio-stash_*.deb /
