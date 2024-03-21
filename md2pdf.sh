#!/bin/bash

for dir in */; do
  if [ -d "$dir" ]; then
    # 去掉末尾的 /
    dir=${dir%/}
    echo "开始转换目录: $dir"
    node $HOME/project/weineel/md2pdf/src/main.js convert -c -s "$dir" && node $HOME/project/weineel/md2pdf/src/main.js concat "$dir/$dir"
  fi
done
