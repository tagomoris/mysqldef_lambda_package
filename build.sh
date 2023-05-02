#!/bin/bash

mkdir -p tmp
(
    cd tmp
    curl -L -O https://github.com/k0kubun/sqldef/releases/download/v0.15.22/mysqldef_linux_amd64.tar.gz
    tar xzf mysqldef_linux_amd64.tar.gz
)
docker build -t mysqldef-lambda .
rm -rf tmp
