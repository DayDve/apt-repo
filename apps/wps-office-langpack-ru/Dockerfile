FROM ubuntu:24.04 AS build
ARG APP_VERSION
RUN apt-get update && apt-get install -y -qq git wget p7zip-full dpkg-dev
RUN git clone --depth 1 https://github.com/DayDve/wps-office-langpack-ru.git /src
RUN cd /src && bash build.sh "${APP_VERSION##*.}"
RUN cd /src/dist && for f in *.deb; do mv "$f" "${f/_all.deb/_noble_amd64.deb}"; done

FROM scratch
COPY --from=build /src/dist/*.deb /
