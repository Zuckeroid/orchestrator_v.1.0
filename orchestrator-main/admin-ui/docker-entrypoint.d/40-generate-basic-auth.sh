#!/bin/sh
set -eu

if [ -z "${ADMIN_UI_BASIC_AUTH_USER:-}" ] || [ -z "${ADMIN_UI_BASIC_AUTH_PASSWORD:-}" ]; then
    echo "ADMIN_UI_BASIC_AUTH_USER and ADMIN_UI_BASIC_AUTH_PASSWORD are required" >&2
    exit 1
fi

htpasswd -bc /etc/nginx/.htpasswd "$ADMIN_UI_BASIC_AUTH_USER" "$ADMIN_UI_BASIC_AUTH_PASSWORD" >/dev/null
