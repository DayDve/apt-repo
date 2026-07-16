ARG APP_VERSION

FROM alpine:latest AS download
RUN apk add --no-cache curl ca-certificates grep && \
    URL=$(curl -sL 'https://www.viber.com/en/download/' | \
      tr -d '\n' | \
      grep -oP '^.*(\K<[^>]*a [^>]+id="desktop-btn-ubuntu"[^>]*>)' | \
      grep -oP 'href="(\K[^"]+)') && \
    curl -fsSL -o /viber.deb "$URL"

FROM scratch
COPY --from=download /viber.deb /
