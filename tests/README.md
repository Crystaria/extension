# 回归测试

不随扩展打包，只用于本地 / CI 验证仓库根目录（`manifest.json` 所在处）的 `content.js` 与 `background.js`。

```bash
cd tests
npm install
npm test
```

覆盖内容：

| 文件 | 覆盖点 |
| --- | --- |
| `converter.test.mjs` | 段落/列表/换行/代码块/引用/表格/图片/转义、嵌套格式、重复注入、深层 DOM 护栏、围栏自适应 |
| `background.test.mjs` | 菜单随设置联动、老标签页兜底注入、受限页面反馈、禁用拦截、异常路径零未捕获拒绝、回调看门狗超时 |

需要真实浏览器验证时，可用 CDP 的 `Extensions.loadUnpacked`（正式版 Chrome 137+ 已屏蔽 `--load-extension`）：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --user-data-dir=/tmp/cam-profile \
  --enable-unsafe-extension-debugging --remote-debugging-port=9224 about:blank
# 然后通过 WebSocket 调 Extensions.loadUnpacked + Runtime.evaluate
```
