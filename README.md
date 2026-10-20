# 声音形状 · Echo Forms

用 Web Audio API 把声音转译成四种可视化形态。

## 核心互动

内置合成演示 / 本地音频文件，波形、频谱、粒子、流体切换。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`，使用相对路径 `base: './'`，可部署到 GitHub Pages 的任意子路径。

## 技术栈

Vue 3 · TypeScript · Vite · CSS / SVG / Canvas（本作全部视觉为原创代码绘制，无外部图片与付费 API 依赖）。
