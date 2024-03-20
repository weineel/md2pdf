const path = require('path');
const { mdToPdf } = require('md-to-pdf');
const pfs = require('fs/promises');
const fs = require('fs');
const Pdf = require('./pdf');
const { program } = require('commander');
const pkg = require('../package.json');
const shell = require('shelljs');
const { URL } = require('url');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const Listr = require('listr');
const chalk = require('chalk')

const { PdfLib, setOutline } = Pdf;

const { PDFDocument } = PdfLib;

const VideoReg = /<video(?: poster="(.*?)")?.*?<source src="(.*?)".*?<\/video>/gs

/** 排序序号分隔符号 */
const SORT_SPLIT_KEY = '_';

function sleepRandom(minMs = 1000, maxMs = 3000) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.random() * (maxMs - minMs) + minMs);
  })
}

/** 获取文件名，去掉后缀 */
function getFilenameWithoutExt(filename) {
  return filename.split('.').slice(0, -1).join('.');
}

/** 单 markdown 转 PDF */
async function singleMdToPdf(markdownPath, config) {
  const cssPath = path.join(__dirname, 'github-markdown-light.css');
  const timeout = 100 * 1000;
  try {
    // 从 markdownPath 中读取内容
    let markdownContent = fs.readFileSync(markdownPath, 'utf-8');
    markdownContent = markdownContent
      // 转换 markdown 内容中的 video 标签为图片和链接
      .replace(VideoReg, (match, posterSrc, videoSrc) => {
        if (posterSrc) {
          return `视频封面:\n\n<img src="${posterSrc}" height="200px" />\n\n[${videoSrc}](${videoSrc})`;
        } else {
          return `${match}\n\n[${videoSrc}](${videoSrc})`;
        }
      })
      // GIF 转换为链接
      .replace(/!\[(.*?)\]\((.*?\.gif.*?)\)/gi, (match, name, src) => {
        return name ? `[${name} - ${src}](${src})` : `[${src}](${src})`;
      });

    return await mdToPdf(
      {
        content: markdownContent,
      },
      {
        basedir: config.basedir,
        stylesheet: [cssPath],
        body_class: ['markdown-body'],
        highlight_style: 'vs',
        pdf_options: {
          timeout,
          format: 'A4',
          margin: {
            top: '40px',
            right: '40px',
            bottom: '40px',
            left: '40px',
          },
        },
        launch_options: {
          headless: 'new',
          timeout,
        },
      }
    )
  } catch (error) {
    console.error('转换失败:', error);
  }
}

/** 当前目录的目录名，如果转换当前目录下的所有文件将作为目录名 */
function getCurrentDirname() {
  return getPathLastName(process.cwd());
}

function getPathLastName(p) {
  return p.split(path.sep).pop();
}

function buildTempPath(filename) {
  const paths = filename.split(path.sep);
  const name = paths.pop();
  return `${path.sep}${path.join(...paths, `~~temp~~${name}`)}`;
}

/**
 * 如果没有指定文件名的话，获取指定目录下的所有 md 文件,
 */
async function getDirFiles(dir, { filenames = [], ext = '.md' }) {
  const markdownFiles = await pfs.readdir(dir);
  // 过滤出 md 文件
  let markdownFilenames = filenames

  if (!markdownFilenames?.length) {
    markdownFilenames = markdownFiles.filter((file) =>
      file.endsWith(ext)
    );
    if (!markdownFilenames.length) {
      throw new Error(`目录 [${dir}] 下没有 ${ext} 文件`)
    }
  }
  return markdownFilenames;
}

/** 压缩 pdf 文件 */
async function compressionPdf(pdfBytes, output) {
  const tempPath = buildTempPath(output);
  await pfs.writeFile(tempPath, pdfBytes);
  await new Promise((resolve, reject) => {
    shell.exec(
      `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${output}" "${tempPath}"`,
      (code) => {
        if (code === 0) {
          // 删除 temp 文件
          pfs.unlink(tempPath);
        } else {
          // 直接使用未压缩的 temp 文件
          shell.mv(tempPath, output);
        }
        resolve();
      }
    );
  });
}

/**
 * ! 不要压缩，因为压缩后的 pdf 可能无法合并
 */
async function convertAll(
  filenames,
  {
    srcDir,
    desDir,
    skipExist = true,
    concurrent,
    concurrentNum,
    exitOnError,
  }
) {
  // 获取目录下的所有 md 文件, 或者直接使用指定文件
  let markdownFilenames = await getDirFiles(srcDir, { filenames });
  if (!fs.existsSync(desDir)) {
    // 创建子目录
    await pfs.mkdir(desDir, { recursive: true });
  }

  const tasks = markdownFilenames.map(fiename => {
    const outputDir = path.join(desDir, `${getFilenameWithoutExt(fiename)}.pdf`);
    const title = `转换 ${chalk.underline(fiename)}`
    return {
      title,
      skip: () => {
        // 开启了跳过存在文件的话，校验目标文件存在就跳过转换
        if (skipExist && fs.existsSync(outputDir)) {
          return `跳过${title}`
        }
      },
      task: async () => {
        const markdownPath = path.join(srcDir, fiename);
        const pdf = await singleMdToPdf(markdownPath, { basedir: srcDir })
        await pfs.writeFile(outputDir, pdf.content);
        // 防止过快，网络可能扛不住
        await sleepRandom()
      },
    }
  })

  await new Listr(tasks, { concurrent: concurrent ? concurrentNum : false, exitOnError, renderer: 'default' })
    .run()
}

async function concatAll(
  dir,
  {
    output,
    sort = true,
    sortSplitKey = SORT_SPLIT_KEY,
    compression = true,
  },
) {

  function splitSortAndFilename(filename, sortSplitKey) {
    const paths = filename.split(sortSplitKey);
    const sort = paths.shift();
    return {
      sort: parseInt(sort) || 0,
      name: paths.join(sortSplitKey),
    };
  }
  // 过滤出 pdf 文件
  let markdownFilenames = await getDirFiles(dir, { ext: '.pdf' });

  if (sort) {
    // 排序
    markdownFilenames.sort((a, b) => {
      const aIndex = splitSortAndFilename(a, sortSplitKey).sort;
      const bIndex = splitSortAndFilename(b, sortSplitKey).sort;
      return aIndex - bIndex;
    });
  }

  const pdfDoc = await PDFDocument.create();
  // 添加 outline
  const outlines = [];

  for (let index = 0; index < markdownFilenames.length; index++) {
    const currentFilename = markdownFilenames[index];
    console.log(`正在拼接 ${currentFilename}...`)
    // 加载 pdf
    const pdfBytes = await pfs.readFile(path.join(dir, currentFilename));
    const currentPdf = await PDFDocument.load(pdfBytes);
    outlines.push({
      title: splitSortAndFilename(getFilenameWithoutExt(currentFilename), sortSplitKey).name,
      to: pdfDoc.getPageCount(),
    })
    for (let index = 0; index < currentPdf.getPageCount(); index++) {
      // 合并 pdf
      const [page] = await pdfDoc.copyPages(currentPdf, [index]);
      pdfDoc.addPage(page);
    }
  }

  // 设置 outline
  setOutline(pdfDoc, outlines);

  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  if (compression) {
    console.log(`正在压缩合并后的文件: ${getPathLastName(output)}...`)
    await compressionPdf(pdfBytes, output);
  } else {
    console.log(`正在保存合并后的文件: ${getPathLastName(output)}...`)
    await pfs.writeFile(output, pdfBytes);
  }
}

function normalizePathParam(filename) {
  return String(filename || '').trim()
}

/**
 * 原文件名是 hash，可以保证唯一性
 * @returns {{ uri: string, out: string }}
 */
function makeDownloadParam(srcUrl) {
  const url = new URL(srcUrl)
  const filename = url.pathname
    .split('/')
    .pop()

  return {
    uri: srcUrl,
    out: filename,
  }
}

async function localizeAll(
  filenames,
  {
    srcDir,
    skipExist = true,
  }
) {
  // 获取目录下的所有 md 文件, 或者直接使用指定文件
  const markdownFilenames = await getDirFiles(srcDir, { filenames });

  for (let index = 0; index < markdownFilenames.length; index++) {
    const currentMarkdownFilename = markdownFilenames[index];
    const outputDir = path.join(srcDir, currentMarkdownFilename);
    const markdownPath = path.join(srcDir, currentMarkdownFilename);
    // 从 markdownPath 中读取内容
    let content = fs.readFileSync(markdownPath, 'utf-8');
    // 使用 aria2 jsonrpc 下载静态资源
    // 获取 md 中的静态资源发送到 aria2 下载
    // { uri: '', out: '' }[]
    let staticResourceUrls = []
    content = content
      .replace(/!\[(.*?)\]\((\<?(.*?)\>?)\)/g, (match, name, urlStr1, urlStr) => {
        try {
          const downloadParam = makeDownloadParam(urlStr)
          staticResourceUrls.push(downloadParam)

          return `![${name}-${downloadParam.out}](./assets/${downloadParam.out})\n<!-- ${match} -->`
        } catch (error) {
          console.error('提取静态资源链接失败:', error);
          return match
        }
      })
      // 下载视频, 并替换为本地链接
      .replace(VideoReg, (match, posterSrc, videoSrc) => {
        try {
          const videoDownloadParam = makeDownloadParam(videoSrc)
          const videoLocalSrc = `./assets/${videoDownloadParam.out}`
          if (videoSrc.startsWith('http')) staticResourceUrls.push(videoDownloadParam)
          if (posterSrc) {
            const posterDownloadParam = makeDownloadParam(posterSrc)
            const posterLocalSrc = `./assets/${posterDownloadParam.out}`
            if (posterSrc.startsWith('http')) staticResourceUrls.push(posterDownloadParam)
            return `<video poster="${posterLocalSrc}" preload="none" controls=""><source src="${videoLocalSrc}" type="video/mp4"></video>\n<!-- ${match} -->`
          } else {
            return `<video preload="none" controls=""><source src="${videoLocalSrc}" type="video/mp4"></video>\n<!-- ${match} -->`
          }
        } catch (error) {
          console.error('提取视频链接失败:', error);
          return match
        }
      })

    if (skipExist) {
      // 过滤掉已经存在的文件
      staticResourceUrls = staticResourceUrls.filter(e => !fs.existsSync(path.join(srcDir, 'assets', e.out)))
    }

    if (staticResourceUrls.length) {
      console.log(`正在下载 ${currentMarkdownFilename} 的${staticResourceUrls.length}个静态资源...`)
      await fetch('http://127.0.0.1:6800/jsonrpc', {
        method: 'post',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: uuidv4(),
          method: 'system.multicall',
          params: [
            staticResourceUrls.map(e => ({
              methodName: 'aria2.addUri',
              params: [
                [e.uri],
                {
                  dir: `${srcDir}/assets`,
                  out: e.out,
                },
              ],
            })),
          ],
        })
      })
    }
    await pfs.writeFile(outputDir, content);
    await sleepRandom();
  }
}

async function main() {
  program
    .name('wn-md-pdf')
    .description('将 markdown 文件转换为 pdf、合并为一个 pdf 等功能')
    .version(pkg.version);

  // md-to-pdf
  program.command('convert')
    .description('转换 markdown 文件')
    .arguments('[filenames...]', '如果传入了文件名，则转换窜入的文件，可以传入多个')
    .option('-s, --src-dir [srcDir]', '指定源目录，默认为当前目录')
    .option('-d, --des-dir [desDir]', '指定目标目录，默认为源目录下的同名子目录')
    .option('-c, --concurrent', '并发执行转换任务', false)
    .option('--concurrent-num [concurrentNum]', '指定数字，控制最大并行数量, 默认 5', (value, defaultValue) => {
      return parseInt(value, 10);
    }, 5)
    .option('--no-exit-on-error', '发生错误的时候不退出，转换多个文件的时候，可能部分失败，会把能转换的全部转换')
    .option('--no-skip-exist', '默认检查，即不设置这个标识，检查目标文件是否存在，存在则跳过，模拟断点续传')
    .option('--compression', '默认不压缩生成的 pdf 文件，压缩后的 pdf 文件可能无法合并', false)
    .action(async (filenames, options) => {
      try {
        const srcDir = path.resolve(normalizePathParam(options.srcDir) || process.cwd());
        const desDir = path.resolve(normalizePathParam(options.desDir) || path.join(srcDir, getPathLastName(srcDir)));
        await convertAll(filenames, {
          ...options,
          srcDir,
          desDir,
        })
        console.log('转换完成');
      } catch (error) {
        console.error('转换失败:', error);
      }
    })

  // concat 指定目录下的所有 pdf 文件
  program.command('concat')
    .description('合并指定目录下的所有 pdf 文件')
    .arguments('[dir]', '指定目录，默认为当前目录同名的子目录')
    .option('-o, --output [output]', '输出文件名，默认为当前目录同名的 pdf 文件, 如果指定了目录，则默认为指定目录的同名 pdf 文件')
    .option('--no-skip-exist', '如果输出文件名已存在，默认跳过拼接，设置了这个标识，则覆盖已存在的文件')
    .option('--no-sort', '合并为一个文件时不排序')
    .option('--sort-split-key <sortSplitKey>', '排序分隔符', SORT_SPLIT_KEY)
    .option('--compression', '用 GhostScript 压缩合并后的 pdf 文件', false)
    .action(async (dir, options) => {
      try {
        const name = dir || getCurrentDirname()
        dir = path.resolve(name);
        console.log('正在合并...', name);
        const output = path.resolve(normalizePathParam(options.output) || `${dir}.pdf`);
        if (options.skipExist && fs.existsSync(output)) {
          console.log(`输出文件[${output}]已存在，跳过合并`);
          return;
        }
        await concatAll(dir, {
          ...options,
          output,
        });
        console.log('合并完成');
      } catch (error) {
        console.error('合并失败:', error);
      }
    })

  // 下载静态资源, 例如图片、视频等，并更新 markdown 链接到本地文件
  program.command('localize')
    .description('下载静态资源(aria2 jsonrpc), 例如图片、视频等，并更新 markdown 链接到本地文件')
    .arguments('[filenames...]', '如果传入了文件名，则转换窜入的文件，可以传入多个')
    .option('-s, --src-dir [srcDir]', '指定源目录，默认为当前目录')
    // TODO: 不下载视频
    .option('--no-video', '不下载视频')
    // TODO: 不下载图片
    .option('--no-image', '不下载图片')
    // TODO: 不下载 gif
    .option('--no-gif', '不下载 gif')
    .option('--no-skip-exist', '不跳过已存在的文件')
    .action(async (filenames, options) => {
      try {
        const srcDir = path.resolve(normalizePathParam(options.srcDir) || process.cwd());
        await localizeAll(filenames, {
          ...options,
          srcDir,
        })
        console.log('下载静态资源完成');
      } catch (error) {
        console.error('下载静态资源失败:', error);
      }
    })

  program.parse(process.argv);
}

main();
