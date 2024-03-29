import fs from 'fs';
import os from 'os';
// import child_process from 'process';
// import shell from 'shelljs';

// 读取当前目录
function getDirs() {
  const dirs = fs.readdirSync('./');
  return dirs.filter((dir) => !dir.startsWith('.') && !dir.endsWith('.mjs') && !dir.endsWith('.log'));
}

// 子线程可以输出颜色
process.env.FORCE_COLOR = 3
console.log(os.homedir());
// process.stdin.isTTY = true
// console.log(process.stdout.isTTY);

for (const dir of getDirs()) {
  // shell.exec(`node ${os.homedir()}/project/weineel/md2pdf/src/main.js convert -c -s '${dir}' && node ${os.homedir()}/project/weineel/md2pdf/src/main.js concat '${dir}/${dir}'`, function(code, stdout, stderr) {
  //   console.log('Exit code:', code);
  //   console.log('Program output:', stdout);
  //   console.log('Program stderr:', stderr);
  //   if (code===0) {
  //     console.log('成功')
  //     // do something
  //   }
  // });
  // child_process.execSync(`node ${os.homedir()}/project/weineel/md2pdf/src/main.js convert -c -s '${dir}' && node ${os.homedir()}/project/weineel/md2pdf/src/main.js concat '${dir}/${dir}'`)
  // await $`node ${os.homedir()}/project/weineel/md2pdf/src/main.js convert -c -s ${dir} && node ${os.homedir()}/project/weineel/md2pdf/src/main.js concat ${dir}/${dir}`
}
