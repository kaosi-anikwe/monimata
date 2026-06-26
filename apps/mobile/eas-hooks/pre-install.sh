#!/usr/bin/env bash
set -e

# CMake is only needed for the Android build (Linux worker).
# Skip silently on macOS (iOS worker).
if [[ "$(uname)" == "Darwin" ]]; then
  echo "macOS worker — skipping CMake install."
  exit 0
fi

CMAKE_VERSION="3.30.3"
CMAKE_DIR="$ANDROID_SDK_ROOT/cmake/$CMAKE_VERSION"

if [ ! -d "$CMAKE_DIR" ]; then
  echo "Downloading CMake $CMAKE_VERSION..."
  cd /tmp
  curl -sL "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION-linux-x86_64.tar.gz" -o "cmake-$CMAKE_VERSION-linux-x86_64.tar.gz"
  
  echo "Extracting CMake..."
  tar -xzf "cmake-$CMAKE_VERSION-linux-x86_64.tar.gz"
  
  echo "Moving CMake to Android SDK path..."
  mkdir -p "$ANDROID_SDK_ROOT/cmake"
  mv "cmake-$CMAKE_VERSION-linux-x86_64" "$CMAKE_DIR"
  
  echo "CMake $CMAKE_VERSION installed successfully."
else
  echo "CMake $CMAKE_VERSION is already present."
fi
