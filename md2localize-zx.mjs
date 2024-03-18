import fs from 'fs';

// 读取当前目录
function getDirs() {
  const dirs = fs.readdirSync('./');
  return dirs.filter((dir) => !dir.startsWith('.') && !dir.endsWith('.mjs'));
}

for (const dir of getDirs()) {
  await $`node /Users/lijufeng/project/weineel/md2pdf localize -s ${dir}`
}
