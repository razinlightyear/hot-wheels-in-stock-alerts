#!/bin/bash

# Force Node/npm to stream output without a terminal
export CI=true
# Silence the npm update notice
export npm_config_update_notifier=false

# Only apply Mac paths if running on macOS
if [ "$(uname)" == "Darwin" ]; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.asdf/shims:$HOME/.asdf/bin:/usr/bin:/bin:/usr/sbin:/sbin"
fi

cd "$(dirname "$0")"

git pull origin master --quiet

# Load the .env file safely
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Run the TypeScript monitor
npx --yes tsx index.ts

# Replicate the GitHub Action Git logic
git add state.json
git diff --quiet && git diff --staged --quiet || (git commit -m "chore: update inventory state locally" && git push --quiet)