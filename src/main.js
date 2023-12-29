const path = require("path");
const { mdToPdf } = require('md-to-pdf');
const pfs = require("fs/promises");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");
const { program } = require('commander');
const pkg = require('../package.json');

/** 排序序号分隔符号 */
const SORT_SPLIT_KEY = '_';

/** 获取文件名，去掉后缀 */
function getFilenameWithoutExt(filename) {
  return filename.split(".").slice(0, -1).join(".");
}

/** 单 markdown 转 PDF */
async function singleMdToPdf(markdownPath) {
  const cssPath = path.join(__dirname, "github-markdown-light.css");
  try {
    return await mdToPdf(
      {
        path: markdownPath,
      },
      {
        stylesheet: [cssPath],
        body_class: ["markdown-body"],
        highlight_style: 'vs',
        pdf_options: {
          format: 'A4',
          margin: {
            top: "60px",
            right: "55px",
            bottom: "55px",
            left: "60px",
          },
        },
        launch_options: {
          headless: 'new',
        },
      }
    )
  } catch (error) {
    console.error("转换失败:", error);
  }
}

/** 当前目录的目录名，如果转换当前目录下的所有文件将作为目录名 */
function getCurrentDirname() {
  return getPathLastName(process.cwd());
}

function getPathLastName(p) {
  return p.split(path.sep).pop();
}

/**
 * 如果没有指定文件名的话，获取指定目录下的所有 md 文件,
 */
async function getDirFiles(dir, { filenames = [], ext = ".md" }) {
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

async function convertAll(
  filenames,
  {
    srcDir,
    desDir,
    skipExist = true,
  }
) {
  // 获取当前目录下的所有 md 文件, 或者直接使用指定文件
  const markdownFilenames = await getDirFiles(srcDir, { filenames });
  if (!fs.existsSync(desDir)) {
    // 创建子目录
    await pfs.mkdir(desDir, { recursive: true });
  }

  for (let index = 0; index < markdownFilenames.length; index++) {
    const currentFilename = markdownFilenames[index];
    const outputDir = path.join(desDir, `${getFilenameWithoutExt(currentFilename)}.pdf`);
    // 如果目标目录已经存在文件则跳过
    if (skipExist && fs.existsSync(outputDir)) {
      continue;
    }
    console.log(`正在转换 ${currentFilename}...`)
    const markdownPath = path.join(srcDir, currentFilename);
    const pdf = await singleMdToPdf(markdownPath)
    await pfs.writeFile(outputDir, pdf.content);
  }
}

async function concatAll(
  dir,
  {
    output,
    sort = true,
    sortSplitKey = SORT_SPLIT_KEY,
  },
) {
  // 过滤出 pdf 文件
  let markdownFilenames = await getDirFiles(dir, { ext: ".pdf" });

  if (sort) {
    // 排序
    markdownFilenames.sort((a, b) => {
      const aIndex = parseInt(a.split(sortSplitKey)[0]) || 0;
      const bIndex = parseInt(b.split(sortSplitKey)[0]) || 0;
      return aIndex - bIndex;
    });
  }

  const pdfDoc = await PDFDocument.create();

  for (let index = 0; index < markdownFilenames.length; index++) {
    const currentFilename = markdownFilenames[index];
    console.log(`正在拼接 ${currentFilename}...`)
    // 加载 pdf
    const pdfBytes = await pfs.readFile(path.join(dir, currentFilename));
    const currentPdf = await PDFDocument.load(pdfBytes);
    for (let index = 0; index < currentPdf.getPageCount(); index++) {
      // 合并 pdf
      const [page] = await pdfDoc.copyPages(currentPdf, [index]);
      pdfDoc.addPage(page);
    }
  }
  console.log(`正在保存合并后的文件: ${getPathLastName(output)}...`)
  const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
  await pfs.writeFile(output, pdfBytes);
}

function normalizePathParam(filename) {
  return String(filename || '').trim()
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
    .option('-d, --des-dir [desDir]', '指定目标目录，默认为当前目录同名的子目录')
    .option('--no-skip-exist', '不设置这个标识，检查目标文件是否存在，存在则跳过，模拟断点续传')
    .action(async (filenames, options) => {
      try {
        const srcDir = path.resolve(normalizePathParam(options.srcDir) || process.cwd());
        const desDir = path.resolve(normalizePathParam(options.desDir) || getCurrentDirname());
        await convertAll(filenames, {
          ...options,
          srcDir,
          desDir,
        })
        console.log("转换完成");
      } catch (error) {
        console.error("转换失败:", error);
      }
    })

  // concat 指定目录下的所有 pdf 文件
  program.command('concat')
    .description('合并指定目录下的所有 pdf 文件')
    .arguments('[dir]', '指定目录，默认为当前目录同名的子目录')
    .option('-o, --output [output]', '输出文件名，默认为当前目录同名的 pdf 文件, 如果指定了目录，则默认为指定目录的同名 pdf 文件')
    .option('--no-sort', '合并为一个文件时不排序')
    .option('--sort-split-key <sortSplitKey>', '排序分隔符', SORT_SPLIT_KEY)
    .action(async (dir, options) => {
      try {
        console.log("正在合并...", getCurrentDirname());
        dir = path.resolve(dir || getCurrentDirname());
        const output = path.resolve(normalizePathParam(options.output) || `${dir}.pdf`);
        await concatAll(dir, {
          ...options,
          output,
        });
        console.log("合并完成");
      } catch (error) {
        console.error("合并失败:", error);
      }
    })

  program.parse(process.argv);
}

main();
