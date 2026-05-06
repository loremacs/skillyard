#!/usr/bin/env bash
# Smoke test for the SkillYard storage layer — uses REST endpoints only.
# Requires: server built (npm run build), jq in PATH, bash 4+.
# Run from mcp/: bash scripts/smoke-test.sh
# set -e intentionally omitted: check() must survive individual test failures

DB=$(mktemp /tmp/skillyard-smoke-XXXXXX.db)
export SKILLYARD_DB_PATH="$DB"
export SKILLYARD_DEV_MODE=true
PASS=0; FAIL=0

# Cleanup on any exit (pass, fail, or ctrl-c)
trap 'npm stop 2>/dev/null; rm -f "$DB" "${DB}-shm" "${DB}-wal"' EXIT

check() {
  if eval "$2"; then
    echo "PASS: $1"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $1"
    FAIL=$((FAIL + 1))
  fi
}

# ── Start server ──────────────────────────────────────────────────────────────
echo "Starting server..."
npm start &>/tmp/skillyard-smoke-server.log &
sleep 2

BASE="http://localhost:3333"

# ── Health ────────────────────────────────────────────────────────────────────
check "GET /health returns status ok" \
  '[[ $(curl -sf "$BASE/health" | jq -r .status) == "ok" ]]'

check "GET /health returns skillCount >= 0" \
  '[[ $(curl -sf "$BASE/health" | jq .skillCount) -ge 0 ]]'

# ── Skill listing ─────────────────────────────────────────────────────────────
check "GET /skills returns array" \
  '[[ $(curl -sf "$BASE/skills" | jq "length") -ge 0 ]]'

SKILL_COUNT=$(curl -sf "$BASE/skills" | jq "length")
if [[ "$SKILL_COUNT" -gt 0 ]]; then
  FIRST_NAME=$(curl -sf "$BASE/skills" | jq -r ".[0].folderName")

  check "GET /skills/:name returns folderName" \
    '[[ $(curl -sf "$BASE/skills/$FIRST_NAME" | jq -r .folderName) == "$FIRST_NAME" ]]'

  check "GET /skills/:name returns contentHash" \
    '[[ $(curl -sf "$BASE/skills/$FIRST_NAME" | jq -r .contentHash) != "null" ]]'

  check "GET /skills/:name/download returns zip content-type" \
    '[[ $(curl -sI "$BASE/skills/$FIRST_NAME/download" | grep -i content-type) == *"application/zip"* ]]'
else
  echo "SKIP: No skills on disk — skipping per-skill checks"
fi

# ── FTS search doesn't throw ──────────────────────────────────────────────────
check "GET /skills?q=gpt-4o does not error" \
  'curl -sf "$BASE/skills?q=gpt-4o" | jq . >/dev/null'

check "GET /skills?q=node.js does not error" \
  'curl -sf "$BASE/skills?q=node.js" | jq . >/dev/null'

# ── Feedback (dev mode) ───────────────────────────────────────────────────────
FB=$(curl -sf -X POST "$BASE/feedback/test" \
  -H "Content-Type: application/json" \
  -d '{"category":"bug","severity":"low","title":"smoke test","description":"automated smoke test entry"}')

check "POST /feedback/test returns feedback_id" \
  '[[ $(echo "$FB" | jq .feedback_id) -gt 0 ]]'

# ── Validation guards ─────────────────────────────────────────────────────────
check "GET /skills/../etc returns 400" \
  '[[ $(curl -s -o /dev/null -w "%{http_code}" "$BASE/skills/..%2Fetc") == "400" ]]'

check "POST /feedback/test with missing fields returns 400" \
  '[[ $(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/feedback/test" \
    -H "Content-Type: application/json" -d "{}") == "400" ]]'

# ── Results ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
