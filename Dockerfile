FROM nginx:1.28-alpine
RUN apk add --no-cache jq
COPY deploy/nginx-main.conf /etc/nginx/nginx.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/runtime-config.jq /usr/local/share/nm-courage/runtime-config.jq
COPY --chmod=0755 deploy/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY dist/ /usr/share/nginx/html/
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

