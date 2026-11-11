#!/bin/bash
# Publish the app only if every test passes.  usage: publish.sh "what changed"
set -e
SRC=/mnt/user-data/outputs/hanout-code/index.html
cd /home/claude/hanout-tests
if ! timeout 300 node smoke.js "$SRC" 2>&1 | grep -v agent-proxy | tee /tmp/claude-0/last-tests.txt | tail -2 | grep -q "PASSED"; then
  cat /tmp/claude-0/last-tests.txt; echo "TESTS FAILED: nothing published"; exit 1; fi
cp "$SRC" /mnt/user-data/outputs/hanout-online/index.html
cp "$SRC" /home/claude/hanout-alhouma/index.html
mkdir -p /home/claude/hanout-alhouma/tests && cp smoke.js publish.sh /home/claude/hanout-alhouma/tests/
[ -f /home/claude/public/hanout.html ] && cp /home/claude/public/hanout.html /mnt/user-data/outputs/hanout-code/other-versions/customer-page-claude.html || true
cd /home/claude/hanout-alhouma && git add -A && git -c user.name="hmissaoui1970" -c user.email="hmissaoui1970@users.noreply.github.com" commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MNHderBkM392X6rNHJ7jvX" && git push -q origin main 2>&1 | tail -2
git log --oneline | head -1; tail -1 /tmp/claude-0/last-tests.txt
