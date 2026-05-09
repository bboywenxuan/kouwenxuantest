const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const srcHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Extract the JSX code from index.html
const jsxMatch = srcHtml.match(/<script type="text\/babel">([\s\S]*?)<\/script>/);
if (!jsxMatch) {
  console.error('未找到 JSX 代码');
  process.exit(1);
}

const jsxCode = jsxMatch[1];

// Build JSX to JS
esbuild.build({
  stdin: {
    contents: jsxCode,
    loader: 'jsx',
    resolveDir: __dirname,
  },
  bundle: false,
  minify: true,
  outfile: path.join(__dirname, 'dist', 'app.js'),
  target: ['es2015'],
}).then(() => {
  // Read the compiled JS
  const compiledJs = fs.readFileSync(path.join(__dirname, 'dist', 'app.js'), 'utf8');
  
  // Create production HTML without Babel
  let prodHtml = srcHtml
    // Remove Babel script
    .replace(/<script src="https:\/\/unpkg\.com\/@babel\/standalone\/babel\.min\.js"><\/script>\n?/, '')
    // Replace JSX script with compiled JS
    .replace(/<script type="text\/babel">[\s\S]*?<\/script>/, `<script src="app.js"></script>`)
    // Add defer to React scripts for better performance
    .replace(/<script crossorigin src="https:\/\/unpkg\.com\/react@18/g, '<script defer crossorigin src="https://unpkg.com/react@18')
    .replace(/<script crossorigin src="https:\/\/unpkg\.com\/react-dom@18/g, '<script defer crossorigin src="https://unpkg.com/react-dom@18');

  // Write production HTML
  fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), prodHtml);
  
  // Copy app.js to dist
  fs.writeFileSync(path.join(__dirname, 'dist', 'app.js'), compiledJs);
  
  console.log('✅ 生产构建完成！输出目录: dist/');
  console.log('📦 文件已优化:');
  console.log('  - 移除 Babel 实时编译');
  console.log('  - JSX 已预编译为 JavaScript');
  console.log('  - 代码已压缩');
  console.log('  - React 脚本已添加 defer 属性');
}).catch(err => {
  console.error('构建失败:', err);
  process.exit(1);
});
