yum install -y git gcc gcc-c++ cpp cpio make cmake automake autoconf chkconfig clang clang-libs dos2unix zlib zlib-devel zip unzip tar perl libxml2 bzip2 bzip2-libs xz xz-libs pkgconfig libtool

# Add JPEG support

cd /root
curl https://github.com/winlibs/libjpeg/archive/refs/tags/libjpeg-9c.tar.gz -L -o tmp-libjpeg.tar.gz
tar xf tmp-libjpeg.tar.gz
cd libjpeg*

dos2unix *
dos2unix -f configure
chmod +x configure

PKG_CONFIG_PATH=/root/build/cache/lib/pkgconfig \
./configure \
CPPFLAGS=-I/root/build/cache/include \
LDFLAGS=-L/root/build/cache/lib \
--disable-dependency-tracking \
--disable-shared \
--enable-static \
--prefix=/root/build/cache

dos2unix -f libtool

make
make install

# Install ImageMagick

cd /root
curl https://github.com/ImageMagick/ImageMagick/archive/7.1.0-55.tar.gz -L -o tmp-imagemagick.tar.gz
tar xf tmp-imagemagick.tar.gz
cd ImageMagick*

PKG_CONFIG_PATH=/root/build/cache/lib/pkgconfig \
./configure \
CPPFLAGS=-I/root/build/cache/include \
LDFLAGS="-L/root/build/cache/lib -lstdc++" \
--disable-dependency-tracking \
--disable-shared \
--enable-static \
--prefix=$ASSET_DIR \
--enable-delegate-build \
--disable-installed \
--without-modules \
--disable-docs \
--without-magick-plus-plus \
--without-perl \
--without-x \
--disable-openmp

make clean
make all
make install


