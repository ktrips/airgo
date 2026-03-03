FROM nginx:alpine

# envsubst 用に gettext をインストール
RUN apk add --no-cache gettext

# デフォルトの nginx 設定を削除
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# 静的ファイルをコピー
COPY index.html style.css app.js /usr/share/nginx/html/
COPY public-trips.json /usr/share/nginx/html/

# nginx 設定テンプレート（起動時に PORT を置換）
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# エントリーポイント
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

CMD ["/docker-entrypoint.sh"]
