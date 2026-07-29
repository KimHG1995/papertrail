#!/usr/bin/env bash
#
# PaperTrail 데모 플로우 — 예제 템플릿으로 전체 파이프라인을 한 번에 돌린다.
#
#   등록(publish) → 승인 워크플로(DRAFT→PUBLISHED) → 문서 생성 →
#   비동기 렌더(Papermake, PDF/A) → 서명 URL 다운로드 → 재현성 검증
#
# 사전 조건: docker compose up -d + db:migrate + gateway/worker 실행 중.
#   (자세한 실행 순서는 README "로컬 개발 인프라" 참고)
#
# 사용법:
#   ./scripts/demo-flow.sh                # 기본값(training-notice, a-3b)으로 실행
#   PDF_STANDARD=pdf-1.7 ./scripts/demo-flow.sh
#   TEMPLATE_TAG=v2 ./scripts/demo-flow.sh
#
# 환경변수(오버라이드):
#   GATEWAY(기본 http://localhost:3000/v1), PAPERTRAIL_API_KEY(기본 dev 키),
#   TEMPLATE_NAME(training-notice), TEMPLATE_TAG(v1), PDF_STANDARD(a-3b),
#   OUT_DIR(/tmp/papertrail-demo)

set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:3000/v1}"
KEY="${PAPERTRAIL_API_KEY:-pt_dev_papertrail_local_key}"
NAME="${TEMPLATE_NAME:-training-notice}"
TAG="${TEMPLATE_TAG:-v1}"
PDF_STANDARD="${PDF_STANDARD:-a-3b}"
OUT_DIR="${OUT_DIR:-/tmp/papertrail-demo}"

EX="$(cd "$(dirname "${BASH_SOURCE[0]}")/../examples/templates" && pwd)"
H=(-H "Authorization: Bearer $KEY" -H 'content-type: application/json')

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

command -v jq >/dev/null || die "jq 가 필요합니다 (brew install jq)"
[ -f "$EX/$NAME.typ" ] || die "템플릿을 찾을 수 없습니다: $EX/$NAME.typ"

# 게이트웨이 도달 확인
curl -s -o /dev/null --max-time 3 "$GATEWAY/templates" "${H[@]}" \
  || die "게이트웨이에 연결할 수 없습니다 ($GATEWAY). docker compose up -d + gateway/worker 실행을 확인하세요."

# --- 1) 등록 (publish) ---
step "1) 템플릿 등록: $NAME:$TAG"
REG=$(jq -n \
  --arg s "$(cat "$EX/$NAME.typ")" \
  --argjson sc "$(cat "$EX/$NAME.schema.json")" \
  '{source:$s, schema:$sc, author:"papertrail-demo"}' \
  | curl -s "${H[@]}" -X POST "$GATEWAY/templates/$NAME/publish?tag=$TAG" -d @-)
MH=$(echo "$REG" | jq -r '.data.manifestHash // empty')
[ -n "$MH" ] || die "등록 실패: $(echo "$REG" | jq -c '.detail // .')"
echo "  manifestHash=$MH  state=$(echo "$REG" | jq -r '.data.state')"

# --- 2) 승인 워크플로 (현재 상태에서 PUBLISHED 까지 전진, 재실행 안전) ---
step "2) 승인 워크플로 → PUBLISHED"
CURRENT=$(curl -s "${H[@]}" "$GATEWAY/templates/$NAME/tags" \
  | jq -r --arg mh "$MH" 'first(.data.tags[] | select(.manifestHash==$mh) | .state) // "DRAFT"')
ORDER=(DRAFT REVIEWING APPROVED PUBLISHED)
START=0
for i in "${!ORDER[@]}"; do [ "${ORDER[$i]}" = "$CURRENT" ] && START=$i; done
if [ "$START" -ge 3 ]; then
  echo "  이미 PUBLISHED (전이 생략)"
else
  for ((i = START + 1; i < ${#ORDER[@]}; i++)); do
    TO="${ORDER[$i]}"
    R=$(jq -n --arg h "$MH" --arg to "$TO" '{manifestHash:$h, to:$to}' \
      | curl -s "${H[@]}" -X POST "$GATEWAY/templates/$NAME/state" -d @-)
    echo "  → $(echo "$R" | jq -r '.data.state // .detail')"
  done
fi

# --- 3) 문서 생성 ---
step "3) 문서 생성 (pdfStandard=$PDF_STANDARD, storeInput=true)"
DOC=$(jq -n \
  --arg t "$NAME:$TAG" \
  --argjson d "$(cat "$EX/$NAME.data.json")" \
  --arg ps "$PDF_STANDARD" \
  '{template:$t, document:$d, pdfStandard:$ps, storeInput:true}' \
  | curl -s "${H[@]}" -X POST "$GATEWAY/documents" -d @-)
ID=$(echo "$DOC" | jq -r '.data.documentId // empty')
[ -n "$ID" ] || die "문서 생성 실패: $(echo "$DOC" | jq -c '.detail // .errors // .')"
echo "  documentId=$ID  status=$(echo "$DOC" | jq -r '.data.status')"

# --- 4) 렌더 완료 대기 ---
step "4) 렌더 대기 (워커 → Papermake)"
STATUS=
for i in $(seq 1 40); do
  V=$(curl -s "${H[@]}" "$GATEWAY/documents/$ID")
  STATUS=$(echo "$V" | jq -r '.data.status')
  printf '  [%02d] %s\n' "$i" "$STATUS"
  case "$STATUS" in
    SUCCEEDED)
      echo "$V" | jq '{status:.data.status, templateHash:.data.templateHash, inputHash:.data.inputHash, outputHash:.data.outputHash, durationMs:.data.durationMs}'
      break ;;
    FAILED) die "렌더 실패: $(echo "$V" | jq -c '.data')" ;;
  esac
  sleep 1
done
[ "$STATUS" = SUCCEEDED ] || die "시간 내 완료되지 않음 (마지막 상태: $STATUS)"

# --- 5) 다운로드 ---
step "5) PDF 다운로드"
URL=$(curl -s "${H[@]}" "$GATEWAY/documents/$ID/download?format=json" | jq -r '.data.url')
mkdir -p "$OUT_DIR"
PDF="$OUT_DIR/$NAME-$ID.pdf"
curl -s "$URL" -o "$PDF"
SIZE=$(wc -c < "$PDF" | tr -d ' ')
MAGIC=$(head -c 5 "$PDF")
[ "$MAGIC" = "%PDF-" ] || die "PDF 형식이 아님 (magic=$MAGIC)"
echo "  saved: $PDF  (size=$SIZE, $MAGIC)"

# --- 6) 재현성 검증 ---
step "6) 재현성 검증 (동일 입력 재렌더 → 해시 대조)"
curl -s "${H[@]}" -X POST "$GATEWAY/documents/$ID/verify" \
  | jq '{reproducible:.data.reproducible, inputMatches:.data.inputHash.matches, outputMatches:.data.outputHash.matches}'

printf '\n\033[1;32m✔ 데모 완료.\033[0m  PDF: %s\n' "$PDF"
command -v open >/dev/null && echo "  열기:  open \"$PDF\""
