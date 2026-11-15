#!/bin/bash
# Build a headless VICE 3.9 (x128, c1541, petcat) without root, into $VICE (default ~/vice).
# Needs: gcc, g++, make, pkg-config, apt-get download (for flex/bison/xa65/dos2unix debs).
set -e
VICE=${VICE:-$HOME/vice}; mkdir -p $VICE/debs $VICE/tools; cd $VICE/debs
apt-get download flex bison m4 libfl2 libfl-dev dos2unix xa65
for d in *.deb; do dpkg -x $d ../tools; done
cd $VICE; [ -f v.tgz ] || curl -sL -o v.tgz "https://sourceforge.net/projects/vice-emu/files/releases/vice-3.9.tar.gz/download"
[ -d vice-3.9 ] || tar xzf v.tgz
T=$VICE/tools/usr; export PATH=$T/bin:$PATH BISON_PKGDATADIR=$T/share/bison M4=$T/bin/m4 LIBRARY_PATH=$T/lib/x86_64-linux-gnu CPATH=$T/include LD_LIBRARY_PATH=$T/lib/x86_64-linux-gnu
cd vice-3.9
./configure --prefix=$VICE/inst --enable-headlessui --disable-html-docs --disable-pdf-docs --without-pulse --without-alsa --without-png --without-gif --without-vorbis --without-flac --without-mpg123 --without-lame --without-libcurl --without-oss --without-zlib --disable-arch --disable-ffmpeg --disable-realdevice --disable-catweasel --disable-hardsid --disable-parsid --disable-ethernet --disable-midi > cfg.log
make -C src/lib/linenoise-ng >/dev/null
make -j$(nproc) -C src x128 c1541 >/dev/null
make -C src/tools/petcat >/dev/null
make -C data install >/dev/null
mkdir -p $HOME/.local/state/vice $HOME/.config/vice
echo "ok: $VICE/vice-3.9/src/x128"
