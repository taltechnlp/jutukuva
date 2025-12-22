#!/bin/bash
# Fix sherpa-onnx native module rpath for macOS
# This script modifies the .node file to add @loader_path so it can find dylibs in the same directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Only run on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "[fix-rpath] Not on macOS, skipping"
    exit 0
fi

# Determine architecture
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
    PACKAGE_NAME="sherpa-onnx-darwin-arm64"
else
    PACKAGE_NAME="sherpa-onnx-darwin-x64"
fi

NODE_MODULE="$PROJECT_DIR/node_modules/$PACKAGE_NAME/sherpa-onnx.node"

if [[ ! -f "$NODE_MODULE" ]]; then
    echo "[fix-rpath] Native module not found: $NODE_MODULE"
    exit 0
fi

echo "[fix-rpath] Fixing rpath for: $NODE_MODULE"

# Check if @loader_path rpath already exists
if otool -l "$NODE_MODULE" | grep -q "@loader_path"; then
    echo "[fix-rpath] @loader_path rpath already exists, skipping"
    exit 0
fi

# Add @loader_path rpath so the .node file can find dylibs in its own directory
install_name_tool -add_rpath @loader_path "$NODE_MODULE"
echo "[fix-rpath] Added @loader_path rpath"

# Verify
echo "[fix-rpath] Updated rpaths:"
otool -l "$NODE_MODULE" | grep -A2 LC_RPATH

echo "[fix-rpath] Done"
