#!/bin/bash

mkdir -p tmp
(
    cd tmp
    curl -s -L -O https://github.com/k0kubun/sqldef/releases/download/v0.15.22/mysqldef_linux_amd64.tar.gz
    tar xzf mysqldef_linux_amd64.tar.gz
)
mkdir build
cp -a index.mjs deploy_keys includes/* tmp/mysqldef build
(cd build && zip -r ../pkg/mysqldef_lambda.zip ./* --exclude deploy_keys/.touched )
rm -rf tmp build
