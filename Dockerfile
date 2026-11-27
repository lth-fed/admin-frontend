FROM nginx:1.31.3-alpine3.24 AS runtime

ENV PORT=80
COPY nginx.conf /etc/nginx/templates/default.conf.template

FROM runtime AS fed-admin-frontend
COPY build/ /usr/share/nginx/html/
