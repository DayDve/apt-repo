ARG APP_VERSION

FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o /localsend.deb \
      "https://github.com/localsend/localsend/releases/download/v${APP_VERSION}/LocalSend-${APP_VERSION}-linux-x86-64.deb"

FROM scratch
COPY --from=download /localsend.deb /
