ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o "/localsend_${APP_VERSION}_amd64.deb" \
      "https://github.com/localsend/localsend/releases/download/v${APP_VERSION}/LocalSend-${APP_VERSION}-linux-x86-64.deb"

FROM scratch
COPY --from=download /localsend_*.deb /
