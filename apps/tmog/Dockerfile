FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl grep && \
    DEB_URL=$(curl -sL 'https://tmog.org' | grep -oP 'href="\K[^"]+\.deb' | head -1) && \
    curl -fsSL -o "/tmog_${APP_VERSION}_amd64.deb" "https://tmog.org${DEB_URL}"

FROM scratch
COPY --from=download /tmog_*.deb /
