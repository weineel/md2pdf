const path = require("path");
const { mdToPdf } = require('md-to-pdf');
const fs = require("fs/promises");
const { PDFDocument } = require("pdf-lib");
const { program } = require('commander');

const SPLIT_KEY = '｜'

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

async function convertAll(filenames, strategy = 'join', sort = true) {
  const outputFilename = process.cwd().split(path.sep).pop();
  const outputPath = path.join(process.cwd(), `${outputFilename}.pdf`);
  // 获取当前目录下的所有 md 文件
  const markdownFiles = await fs.readdir(process.cwd());
  // 过滤出 md 文件
  let markdownFilenames = filenames

  if (!markdownFilenames?.length) {
    markdownFilenames = markdownFiles.filter((file) =>
      file.endsWith(".md")
    );
    if (!markdownFilenames.length) {
      console.log("当前目录下没有 md 文件");
      return;
    }
  }

  if (sort) {
    // 排序
    markdownFilenames.sort((a, b) => {
      const aIndex = parseInt(a.split(SPLIT_KEY)[0]) || 0;
      const bIndex = parseInt(b.split(SPLIT_KEY)[0]) || 0;
      return aIndex - bIndex;
    });
  }

  if (strategy.includes("sep")) {
    // 创建子目录
    const pdfsDir = path.join(process.cwd(), outputFilename);
    await fs.mkdir(pdfsDir, { recursive: true });
  }

  const pdfDoc = await PDFDocument.create();

  for (let index = 0; index < markdownFilenames.length; index++) {
    const currentFilename = markdownFilenames[index];
    console.log(`正在转换 ${currentFilename}...`)
    const markdownPath = path.join(process.cwd(), currentFilename);
    const pdf = await singleMdToPdf(markdownPath)
    if (strategy.includes("sep")) {
      await fs.writeFile(path.join(process.cwd(), outputFilename, `${getFilenameWithoutExt(currentFilename)}.pdf`), pdf.content);
    }

    if (strategy.includes("join")) {
      const currentPdf = await PDFDocument.load(pdf.content);
      for (let index = 0; index < currentPdf.getPageCount(); index++) {
        // 合并 pdf
        const [page] = await pdfDoc.copyPages(currentPdf, [index]);
        pdfDoc.addPage(page);
      }
    }
  }

  if (strategy.includes("join")) {
    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    await fs.writeFile(outputPath, pdfBytes);
  }
}

async function convertSingle(filename) {
  const markdownPath = path.join(process.cwd(), filename);
  const pdf = await singleMdToPdf(markdownPath)
  const outputPath = path.join(process.cwd(), `${getFilenameWithoutExt(filename)}.pdf`);
  await fs.writeFile(outputPath, pdf.content);
}

async function main() {
  program
    .name('wn-md-pdf')
    .description('Convert markdown to pdf')
    .arguments('[filename]', '如果传入了文件名，则转换窜入的文件，可以传入多个')
    .option('-s, --strategy <strategy>', '在转换文件时的策略. join: 仅仅合并为一个文件; sep: 保存转换的所有单个文件; sep-join: 两种都要', 'join')
    .option('--no-sort', '合并为一个文件时不排序')
    .version('0.0.1');

  program.parse(process.argv);

  try {
    // 获取第一个参数 作为文件名
    const filenames = program.args;
    const options = program.opts();
    if (filenames.length === 1) {
      await convertSingle(filenames[0])
    } else {
      await convertAll(filenames, options.strategy, options.sort)
    }
    console.log("转换完成");
  } catch (error) {
    console.error("转换失败:", error);
  }
}

main();
