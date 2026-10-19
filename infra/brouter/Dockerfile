# syntax=docker/dockerfile:1.7
# BRouter server for local development.

FROM busybox:1.37.0 AS download
ARG BROUTER_VERSION=1.7.10
ADD --checksum=sha256:023fec3ba997758e8cd7ab9e1bae52e962af3f00b57683e3de86b84ffad01532 \
  https://github.com/abrensch/brouter/releases/download/v${BROUTER_VERSION}/brouter-${BROUTER_VERSION}.zip /brouter.zip
RUN unzip -q /brouter.zip -d /x \
  && mkdir -p /brouter/profiles2 \
  && cp /x/brouter-${BROUTER_VERSION}/brouter-${BROUTER_VERSION}-all.jar /brouter/brouter.jar \
  && cp /x/brouter-${BROUTER_VERSION}/profiles2/lookups.dat /brouter/profiles2/

FROM eclipse-temurin:21.0.11_10-jre-noble
COPY --from=download /brouter /brouter
WORKDIR /brouter
EXPOSE 17777
# Our presets are mounted at /wayline/profiles. BRouter wants them next to
# lookups.dat, so they are copied on every start.
CMD ["sh", "-c", "cp /wayline/profiles/*.brf profiles2/ && mkdir -p customprofiles && exec java -Xmx1g -DmaxRunningTime=300 -cp brouter.jar btools.server.RouteServer segments4 profiles2 customprofiles 17777 4 0.0.0.0"]
