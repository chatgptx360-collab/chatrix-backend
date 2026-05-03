#!/usr/bin/env bash
# =====================================================
# generate-secrets.sh — print a fresh set of production secrets.
#
# Usage:
#   ./infra/scripts/generate-secrets.sh                # prints to stdout
#   ./infra/scripts/generate-secrets.sh > .env.prod    # save to a file
#
# Each secret is regenerated every run — DO NOT re-run against an existing
# environment without rotating sessions, otherwise refresh-token verification
# breaks for every active user.
# =====================================================

set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required (apt install openssl / brew install openssl)" >&2
  exit 1
fi

gen() { openssl rand -base64 64 | tr -d '\n'; }

cat <<EOF
# Generated $(date -u +"%Y-%m-%d %H:%M:%S UTC") — store these in your secret manager,
# never commit them to git.

JWT_ACCESS_SECRET=$(gen)
JWT_REFRESH_SECRET=$(gen)
EOF
