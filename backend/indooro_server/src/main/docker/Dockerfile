# Laufzeit: JRE 21 (der Maven-Build kompiliert auf Release 17, JRE 21 fuehrt das aus).
FROM eclipse-temurin:21-jre

# Eigener Nicht-root-Benutzer mit fester UID 10001 (passt zu runAsUser in k8s/backend.yaml).
RUN groupadd --system --gid 10001 indooro \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin indooro

WORKDIR /app

# Quarkus-Uber-Jar aus dem Maven-Build (mvn package)
COPY --chown=10001:10001 target/*-runner.jar ./app.jar

USER 10001

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
