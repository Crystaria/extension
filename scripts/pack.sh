#!/usr/bin/env bash
#
# 打包上架用的 zip：只包含扩展运行所需的文件，
# 不会把 tests/、legacy/、REPORT.md、README.md 等开发资产打进去。
#
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./manifest.json').version")"
OUT="dist/copy-as-markdown-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

FILES=(
  manifest.json
  background.js
  content.js
  popup.html
  popup.js
  style.css
  icons
)

for file in "${FILES[@]}"; do
  if [ ! -e "$file" ]; then
    echo "缺少文件: $file" >&2
    exit 1
  fi
done

zip -r -q "$OUT" "${FILES[@]}" -x '*.DS_Store'

echo "已生成 $OUT"
unzip -l "$OUT"
