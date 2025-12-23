#!/bin/bash
# Fix sherpa-onnx native module rpath for macOS and Linux
# This script modifies the .node file to add @loader_path (macOS) or $ORIGIN (Linux)
# so it can find shared libraries in the same directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

OS="$(uname)"

if [[ "$OS" == "Darwin" ]]; then
    # macOS: Use @loader_path
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

    echo "[fix-rpath] Fixing rpath for macOS: $NODE_MODULE"

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

elif [[ "$OS" == "Linux" ]]; then
    # Linux: Use $ORIGIN
    ARCH=$(uname -m)
    if [[ "$ARCH" == "aarch64" ]]; then
        PACKAGE_NAME="sherpa-onnx-linux-arm64"
        PATCHELF_ARCH="aarch64"
    else
        PACKAGE_NAME="sherpa-onnx-linux-x64"
        PATCHELF_ARCH="x86_64"
    fi

    NODE_MODULE="$PROJECT_DIR/node_modules/$PACKAGE_NAME/sherpa-onnx.node"

    if [[ ! -f "$NODE_MODULE" ]]; then
        echo "[fix-rpath] Native module not found: $NODE_MODULE"
        exit 0
    fi

    echo "[fix-rpath] Fixing rpath for Linux: $NODE_MODULE"

    # Find patchelf - check system, then local .tools directory
    PATCHELF_BIN=""
    if command -v patchelf &> /dev/null; then
        PATCHELF_BIN="patchelf"
    elif [[ -x "$PROJECT_DIR/.tools/bin/patchelf" ]]; then
        PATCHELF_BIN="$PROJECT_DIR/.tools/bin/patchelf"
    else
        # Try to download patchelf
        echo "[fix-rpath] patchelf not found, downloading..."
        PATCHELF_VERSION="0.18.0"
        TOOLS_DIR="$PROJECT_DIR/.tools"
        mkdir -p "$TOOLS_DIR"
        curl -sL "https://github.com/NixOS/patchelf/releases/download/${PATCHELF_VERSION}/patchelf-${PATCHELF_VERSION}-${PATCHELF_ARCH}.tar.gz" -o "$TOOLS_DIR/patchelf.tar.gz"
        if [[ $? -eq 0 ]] && [[ -f "$TOOLS_DIR/patchelf.tar.gz" ]]; then
            cd "$TOOLS_DIR" && tar xzf patchelf.tar.gz && cd "$PROJECT_DIR"
            if [[ -x "$TOOLS_DIR/bin/patchelf" ]]; then
                PATCHELF_BIN="$TOOLS_DIR/bin/patchelf"
                echo "[fix-rpath] Downloaded patchelf to $PATCHELF_BIN"
            fi
        fi
    fi

    if [[ -z "$PATCHELF_BIN" ]]; then
        echo "[fix-rpath] Warning: patchelf not found and download failed."
        echo "[fix-rpath] Install with: sudo apt install patchelf"
        echo "[fix-rpath] Skipping Linux rpath fix"
        exit 0
    fi

    # Check current RUNPATH
    CURRENT_RUNPATH=$(readelf -d "$NODE_MODULE" 2>/dev/null | grep RUNPATH | awk -F'[][]' '{print $2}' || echo "")
    echo "[fix-rpath] Current RUNPATH: $CURRENT_RUNPATH"

    # Check if $ORIGIN is already in RUNPATH
    if [[ "$CURRENT_RUNPATH" == *'$ORIGIN'* ]]; then
        echo "[fix-rpath] \$ORIGIN already in RUNPATH, skipping"
        exit 0
    fi

    # Set RUNPATH to $ORIGIN so it finds libs in the same directory
    "$PATCHELF_BIN" --set-rpath '$ORIGIN' "$NODE_MODULE"
    echo "[fix-rpath] Set RUNPATH to \$ORIGIN"

    # Verify
    echo "[fix-rpath] Updated RUNPATH:"
    readelf -d "$NODE_MODULE" 2>/dev/null | grep RUNPATH

else
    echo "[fix-rpath] Unsupported OS: $OS, skipping"
    exit 0
fi

echo "[fix-rpath] Done"
