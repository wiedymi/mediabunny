#!/bin/bash

set -e

ORIGINAL_DIR="$(pwd)"
FFMPEG_VERSION="7.1.2"
BUILD_DIR="ffmpeg-build"
INSTALL_DIR="$(pwd)/eac3-build"

if [ ! -d "$BUILD_DIR" ]; then
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"

    echo "Downloading FFmpeg $FFMPEG_VERSION..."
    curl -L "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" -o ffmpeg.tar.xz
    tar -xf ffmpeg.tar.xz
    cd "ffmpeg-$FFMPEG_VERSION"
else
    cd "$BUILD_DIR/ffmpeg-$FFMPEG_VERSION"
fi

echo "Configuring FFmpeg for WASM (libavcodec + libavutil only for EAC3)..."

export PKG_CONFIG_PATH=""

emconfigure ./configure \
    --prefix="$INSTALL_DIR" \
    --target-os=none \
    --arch=x86_32 \
    --enable-cross-compile \
    --disable-programs \
    --disable-doc \
    --disable-swresample \
    --disable-swscale \
    --disable-postproc \
    --disable-avfilter \
    --disable-avformat \
    --disable-avdevice \
    --disable-network \
    --disable-debug \
    --disable-stripping \
    --enable-small \
    --enable-gpl \
    --enable-version3 \
    --enable-nonfree \
    --disable-decoders \
    --enable-decoder=eac3 \
    --enable-decoder=ac3 \
    --disable-encoders \
    --enable-encoder=eac3 \
    --enable-encoder=ac3 \
    --disable-parsers \
    --enable-parser=ac3 \
    --disable-demuxers \
    --disable-muxers \
    --disable-protocols \
    --disable-asm \
    --disable-x86asm \
    --disable-inline-asm \
    --disable-pthreads \
    --disable-w32threads \
    --disable-os2threads \
    --disable-vulkan \
    --disable-cuda \
    --disable-cuvid \
    --disable-nvenc \
    --disable-vaapi \
    --disable-vdpau \
    --disable-videotoolbox \
    --cc=emcc \
    --cxx=em++ \
    --ar=emar \
    --ranlib=emranlib \
    --extra-cflags="-O3 -fno-exceptions -fno-rtti -flto -msimd128 -ffast-math" \
    --extra-cxxflags="-O3 -fno-exceptions -fno-rtti -flto -msimd128" \
    --extra-ldflags="-O3 -flto -s INITIAL_MEMORY=33554432" \
    --pkg-config-flags="--static"

echo "Building FFmpeg libraries..."
emmake make -j$(sysctl -n hw.ncpu)

echo "Installing libraries..."
emmake make install

echo "Build complete! Libraries installed in $INSTALL_DIR"
echo "Static libraries:"
ls -la "$INSTALL_DIR/lib/"*.a
echo ""
echo "Copying to lib directory..."
mkdir -p "$ORIGINAL_DIR/lib"
if [ -d "$ORIGINAL_DIR/lib" ]; then
    echo "Directory created: $ORIGINAL_DIR/lib"
else
    echo "Failed to create directory: $ORIGINAL_DIR/lib"
fi

echo "Copying $INSTALL_DIR/lib/libavcodec.a to $ORIGINAL_DIR/lib/libavcodec.a"
cp "$INSTALL_DIR/lib/libavcodec.a" "$ORIGINAL_DIR/lib/libavcodec.a"
if [ -f "$ORIGINAL_DIR/lib/libavcodec.a" ]; then
    echo "Success: libavcodec.a copied successfully."
else
    echo "Error: Failed to copy libavcodec.a."
fi

echo "Copying $INSTALL_DIR/lib/libavutil.a to $ORIGINAL_DIR/lib/libavutil.a"
cp "$INSTALL_DIR/lib/libavutil.a" "$ORIGINAL_DIR/lib/libavutil.a"
if [ -f "$ORIGINAL_DIR/lib/libavutil.a" ]; then
    echo "Success: libavutil.a copied successfully."
else
    echo "Error: Failed to copy libavutil.a."
fi

echo "Copying header files..."
mkdir -p "$ORIGINAL_DIR/lib"

cp "$INSTALL_DIR/include/libavcodec/avcodec.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/bsf.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/codec.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/codec_desc.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/codec_id.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/codec_par.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/defs.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/packet.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/version.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavcodec/version_major.h" "$ORIGINAL_DIR/lib/"

cp "$INSTALL_DIR/include/libavutil/attributes.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/avconfig.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/avutil.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/buffer.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/channel_layout.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/common.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/cpu.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/dict.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/error.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/frame.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/intfloat.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/log.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/macros.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/mathematics.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/mem.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/pixfmt.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/rational.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/samplefmt.h" "$ORIGINAL_DIR/lib/"
cp "$INSTALL_DIR/include/libavutil/version.h" "$ORIGINAL_DIR/lib/"

echo ""
echo "Contents of lib directory:"
ls -la "$ORIGINAL_DIR/lib/"

echo "Done! Libraries ready in packages/eac3/lib/"
