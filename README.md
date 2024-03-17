# md2pdf

markdown 转 PDF，支持把多个 markdown 文件转成 PDF 并合并到一个 PDF 文件。

## TODO

* [x] 使用 GhostScript 压缩 pdf, --no-compression 不压缩, [参考](https://dev.to/woovi/how-to-reduce-the-file-size-of-a-pdf-using-nodejs-50b2)，如果质量不满意，可以使用 PDF Squeezer for Mac 应用手动压缩效果更好。
* [x] 检查目标文件是否存在，存在则跳过 --no-skip-exist
* [x] concat 子命令，连接 pdf 文件
* [x] 重构，把 转换和连接拆分成两个子命令，可以通过 || 的方式连接两个命令实现更多能力
* [x] md 转 pdf 的时候增加随机延时
* [x] 添加目录(outline or table of contents)支持。
* [x] 支持自动识别代码语言进行高亮
* [x] 代码块换行
* [x] concat 子命令,检查目标文件是否存在，存在则跳过 --no-skip-exist
* [x] 增加超时的限制时长，现在默认的 30000 ms，在图片过多的场景下不够用了，默认改成了 100000

  * [page.setDefaultNavigationTimeout()](https://pptr.dev/api/puppeteer.page.setdefaultnavigationtimeout) 页面加载的超时时间（复用 launch_options 中 timeout 的配置）
  * [page.pdf](https://pptr.dev/api/puppeteer.page.pdf) 转 pdf 的超时时间 **（pdf_options 中传入 timeout 有效）**

* [ ] 超时的限制时长, 支持命令行参数传入（launch_options.timeout, pdf_options.timeout）
* [ ] 彩色 log，更直观友好的展示处理过程和异常
* [x] video 标签

  * 有封面图直接显示封面图，并把视频链接放在图片下面, 否则直接渲染视频（静态），视频链接放在下面。

* [x] GIF 转成链接([](url.gif) 格式)
* [ ] 把 md 中的静态资源下载到本地，并把 md 源文件中静态资源的路径换成本地相对路径。

  * 跳过已下载的文件
  * 图片、gif、视频
  * 备份原始文件
  * 可以使用 aria2 下载（jsonrpc）方式调用 aria 下载
  * 输出文件名使用 UUID，防止重名覆盖

## 直接使用 gitbook/mdbook 等类似的库，是不是 md 可以直接转成电子书？

## md 转 epub？

## Other

## 使用示例

### patch: https://pnpm.io/cli/patch

1. 生成 patch： `pnpm patch md-to-pdf@5.2.4`
2. 根据提示修改代码
3. 根据提示生成 patch，会在 package.json 中体现配置。
