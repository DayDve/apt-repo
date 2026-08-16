FROM alpine:latest AS download
ARG APP_VERSION
RUN apk add --no-cache curl ca-certificates && \
    curl -fsSL -o "/glab_${APP_VERSION}_linux_amd64.deb" \
      "https://gitlab.com/api/v4/projects/gitlab-org%2Fcli/packages/generic/glab/${APP_VERSION}/glab_${APP_VERSION}_linux_amd64.deb"

FROM scratch
COPY --from=download /glab_*.deb /
