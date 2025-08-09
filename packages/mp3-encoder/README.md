Build

Compiling LAME:
```
emconfigure ./configure \
    CFLAGS="-DNDEBUG -DNO_STDIO -O3 -msimd128" \
    --disable-dependency-tracking \
    --disable-shared \
    --disable-gtktest \
    --disable-analyzer-hooks \
    --disable-decoder \
    --disable-frontend

emmake make clean
emmake make
```

Then extract the file `libmp3lame/.libs/libmp3lame.a`, which you'll need to build the LAME bridge.

Compiling the LAME bridge:
```
emcc src/lame-bridge.c build/libmp3lame.a \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s SINGLE_FILE=1 \
    -s ENVIRONMENT=web,worker \
    -s EXPORTED_RUNTIME_METHODS=cwrap,HEAPU8 \
    -s EXPORTED_FUNCTIONS=_malloc,_free \
    -msimd128 \
    -O3 \
    -o build/lame.js
```