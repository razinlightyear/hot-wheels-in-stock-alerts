#!/bin/bash
 
PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.asdf/shims:$HOME/.asdf/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Navigate to the repository
cd "$(dirname "$0")"

git pull origin master --quiet

# Load the .env file safely
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Run the TypeScript monitor
npx tsx index.ts
 
# Replicate the GitHub Action Git logic
git add state.json
git diff --quiet && git diff --staged --quiet || (git commit -m "chore: update inventory state locally" && git push)
