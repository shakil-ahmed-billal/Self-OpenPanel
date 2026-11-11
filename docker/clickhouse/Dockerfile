FROM clickhouse/clickhouse-server:26.1.3.52

COPY clickhouse-config.xml /etc/clickhouse-server/config.d/op-config.xml
COPY clickhouse-user-config.xml /etc/clickhouse-server/users.d/op-user-config.xml
COPY init-db.sh /docker-entrypoint-initdb.d/init-db.sh

RUN chmod +x /docker-entrypoint-initdb.d/init-db.sh
