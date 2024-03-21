#!/bin/bash

for dir in */; do
  if [ -d "$dir" ]; then
    # 去掉末尾的 /
    dir=${dir%/}
    echo "开始下载: $dir"
    node $HOME/project/weineel/md2pdf localize -s "${dir}"
  fi
done
