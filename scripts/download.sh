#!/bin/sh

if [ -d "tmp" ]; then
  rm -rf tmp
fi
mkdir tmp -p

cd tmp

wget https://github.com/dscharrer/innoextract/releases/download/1.9/innoextract-1.9-linux.tar.xz
tar xvJf innoextract-1.9-linux.tar.xz

wget $(cat ../url.txt) -O latest.zip
unzip latest.zip

./innoextract-1.9-linux/bin/amd64/innoextract setup.exe

cd ..

if [ -d "dist" ]; then
  rm -rf dist
fi
mkdir dist -p
cp tmp/app/qqwry.dat dist/
rm -rf tmp