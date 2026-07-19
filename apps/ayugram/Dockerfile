FROM ghcr.io/telegramdesktop/tdesktop/centos_env:latest AS build

USER root

ARG APP_VERSION

RUN yum install -y ccache

WORKDIR /build

RUN git clone --depth 1 --branch dev \
    https://github.com/AyuGram/AyuGramDesktop.git src \
 && cd src \
 && git submodule update --init --recursive --depth 1

RUN chown -R user:user /build

FROM scratch
COPY --from=build /build /build
