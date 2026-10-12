#!/bin/bash
# macOS: serve the "site" folder with the system Python and open the browser
cd "$(dirname "$0")/site" || exit 1
PORT=8080
(sleep 1; open "http://localhost:$PORT/") &
echo "Website is running at http://localhost:$PORT/ - close this window to stop."
python3 -m http.server "$PORT"
