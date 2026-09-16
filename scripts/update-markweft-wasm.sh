#!/usr/bin/env bash

set -euo pipefail

project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
markweft_dir=${MARKWEFT_RS_DIR:-"$project_dir/../../markweft-rs"}
asset_dir="$project_dir/public/wasm/markweft"
build_dir=$(mktemp -d /tmp/markweft-blog-pkg.XXXXXX)

cleanup() {
  rm -rf -- "$build_dir"
}
trap cleanup EXIT

"$markweft_dir/scripts/build-wasm.sh" "$build_dir"
mkdir -p "$asset_dir"
cp "$build_dir/markweft.js" "$asset_dir/markweft.js"
cp "$build_dir/markweft_bg.wasm" "$asset_dir/markweft_bg.wasm"
