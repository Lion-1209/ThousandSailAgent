#!/usr/bin/env bash
# AgentFlow Release Build Script
# 打包为独立可执行文件（Windows / macOS / Linux）
#
# 前置依赖:
#   npm install -g @yao-pkg/pkg
#
# 用法:
#   bash release/build.sh          # 构建当前平台
#   bash release/build.sh all      # 构建所有平台

set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
NAME="agentflow"
DIST="release/dist"

echo "=== AgentFlow v${VERSION} Build ==="

# 先编译 TypeScript
echo "[1/3] Compiling TypeScript..."
npm run build

# 安装生产依赖到临时目录
echo "[2/3] Installing production dependencies..."
rm -rf "${DIST}"
mkdir -p "${DIST}/pkg"
cp package.json "${DIST}/pkg/"
cd "${DIST}/pkg"
npm install --omit=dev --ignore-scripts
cd ../..

# 复制编译产物
cp -r dist/* "${DIST}/pkg/dist/"
cp README.md "${DIST}/pkg/"

# 确认入口文件有 shebang
head -1 "${DIST}/pkg/dist/cli/index.js" | grep -q '#!' || sed -i '1i#!/usr/bin/env node' "${DIST}/pkg/dist/cli/index.js"

echo "[3/3] Packaging binaries..."

cd "${DIST}/pkg"

if [ "${1:-}" = "all" ]; then
  echo "Building all platforms..."
  npx pkg . \
    --target node18-macos-x64,node18-macos-arm64,node18-linux-x64,node18-win-x64 \
    --output "../${NAME}-v${VERSION}" \
    --config '{"bin": "dist/cli/index.js", "pkg": {"assets": ["dist/**/*"]}}'
else
  echo "Building current platform..."
  npx pkg . \
    --target host \
    --output "../${NAME}-v${VERSION}" \
    --config '{"bin": "dist/cli/index.js", "pkg": {"assets": ["dist/**/*"]}}'
fi

cd ../..

echo ""
echo "=== Build Complete ==="
echo "Output: ${DIST}/"
ls -lh "${DIST}/"

echo ""
echo "Done! Upload the binaries to GitHub Releases."
