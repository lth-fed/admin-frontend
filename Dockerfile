FROM nginx:1.31.3-alpine3.24 AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf

FROM runtime AS fed-admin-frontend
COPY build/ /usr/share/nginx/html/
