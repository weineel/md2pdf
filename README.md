# md2pdf

markdown 转 PDF，支持把多个 markdown 文件转成 PDF 并合并到一个 PDF 文件。

## TODO

* [*] 使用 GhostScript 压缩 pdf, --no-compression 不压缩, [参考](https://dev.to/woovi/how-to-reduce-the-file-size-of-a-pdf-using-nodejs-50b2)，如果质量不满意，可以使用 PDF Squeezer for Mac 应用手动压缩效果更好。
* [*] 检查目标文件是否存在，存在则跳过 --no-skip-exist
* [*] concat 子命令，连接 pdf 文件
* [*] 重构，把 转换和连接拆分成两个子命令，可以通过 || 的方式连接两个命令实现更多能力
* ［ ］ md 转 pdf 的时候增加随机延时
* ［ ］ 添加目录支持。

## 直接使用 gitbook 等类似的库，是不是 md 可以直接转成电子书？

## md 转 epub？

