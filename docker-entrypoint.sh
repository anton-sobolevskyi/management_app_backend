#!/bin/sh
# Container entrypoint: apply migrations, then replace the shell with node so
# the app is PID 1 and receives SIGTERM directly (graceful shutdown).
set -e

# Set RUN_MIGRATIONS=false when running several replicas: run
# `prisma migrate deploy` once as a release step instead.
if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  echo "Applying database migrations..."
  npx prisma migrate deploy
fi

exec node dist/src/main
