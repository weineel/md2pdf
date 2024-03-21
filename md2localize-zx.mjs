import fs from 'fs';
import os from 'os';

// 读取当前目录
function getDirs() {
  const dirs = fs.readdirSync('./');
  return dirs.filter((dir) => !dir.startsWith('.') && !dir.endsWith('.mjs'));
}

for (const dir of getDirs()) {
  await $`node ${os.homedir()}/project/weineel/md2pdf localize -s ${dir}`
}
