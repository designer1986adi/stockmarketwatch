#!/bin/bash
# Starts the app's server in the background (if it isn't running) and opens it in the browser.
# Used by the "Aditya Share Market" desktop app. Server output goes to .server.log.

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
URL="http://stock-analysis.localhost:3000"

if ! lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  cd "$APP_DIR" || exit 1
  # Run the server in its own session so it keeps running after the desktop app quits.
  # (Without this, it gets stopped along with the launcher and search stops working.)
  nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' npm run dev \
    < /dev/null > "$APP_DIR/.server.log" 2>&1 &
  disown
  # Wait up to 60 seconds for the server to come up.
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "$URL/login" && break
    sleep 1
  done
fi

open "$URL"
