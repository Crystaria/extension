/**
 * content.js 转换器回归测试（jsdom）
 * 运行：cd tests && npm install && npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const CONTENT = fs.readFileSync(new URL('../content.js', import.meta.url), 'utf8');

const SETTINGS = {
  enabled: true,
  convertLinks: true,
  convertImages: true,
  convertHeadings: true,
  preserveFormatting: true,
  showNotification: true
};

function bootstrap(html) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${html}</body></html>`, {
    runScripts: 'outside-only'
  });
  dom.window.chrome = { runtime: { onMessage: { addListener() {} } } };
  dom.window.eval(CONTENT);

  const range = dom.window.document.createRange();
  range.setStart(dom.window.document.body, 0);
  range.setEnd(dom.window.document.body, dom.window.document.body.childNodes.length);

  const selection = {
    rangeCount: 1,
    isCollapsed: false,
    getRangeAt: () => range,
    toString: () => range.toString()
  };

  return {
    dom,
    api: dom.window.__copyAsMarkdown,
    convert: () => dom.window.__copyAsMarkdown.convertToMarkdown(selection, SETTINGS)
  };
}

const PAGE = `
<h2>Hello World</h2>
<p>first with <strong>bold</strong> and a <a href="https://example.com/a">link</a>.</p>
<p>second with <a href="https://example.com/b"><strong>bold link</strong></a>.</p>
<ul><li>Item one</li><li>Item two<ul><li>nested</li></ul></li></ul>
<ol start="3"><li>third</li><li>fourth</li></ol>
<p>Line one<br>Line two</p>
<pre><code class="language-js">const a = 1;</code></pre>
<blockquote>quoted text</blockquote>
<table><tr><th>Name</th><th>Value</th></tr><tr><td>a|b</td><td>1</td></tr></table>
<img src="https://example.com/x.png" alt="pic">
<p>price: 3 * 4 and snake_case [not a link]</p>
`;

test('重复注入同一个 content.js 不会抛错', () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { onMessage: { addListener() {} } } };
  dom.window.eval(CONTENT);
  assert.doesNotThrow(() => dom.window.eval(CONTENT));
});

test('段落 / 列表 / 换行 / 代码块 / 引用 / 表格 / 图片 / 转义', () => {
  const { convert } = bootstrap(PAGE);
  const out = convert();

  assert.match(out, /\.\n\nsecond with/, '段落之间应有空行');
  assert.match(out, /^- Item one$/m);
  assert.match(out, /^ {2}\* nested$/m, '嵌套列表应有缩进');
  assert.match(out, /^3\. third$/m, 'ol start 应生效');
  assert.match(out, /Line one\\\nLine two/, '<br> 应输出硬换行');
  assert.match(out, /```js\nconst a = 1;\n```/);
  assert.match(out, /^> quoted text$/m);
  assert.match(out, /\| Name \| Value \|/);
  assert.match(out, /\| a\\\|b \| 1 \|/, '单元格里的 | 应转义');
  assert.match(out, /!\[pic\]\(https:\/\/example\.com\/x\.png\)/);
  assert.match(out, /\[\*\*bold link\*\*\]\(https:\/\/example\.com\/b\)/, '链接内加粗要保留');
  assert.match(out, /3 \\\* 4/, '* 应转义');
  assert.match(out, /snake\\_case/, '_ 应转义');
  assert.match(out, /\\\[not a link\\\]/, '[] 应转义');
  assert.match(out, /^## Hello World$/m);
});

test('代码块内容包含 ``` 时围栏自动加长', () => {
  const { convert } = bootstrap('<pre><code>before\n```\nafter</code></pre>');
  assert.equal(convert().trim(), '````\nbefore\n```\nafter\n````');
});

test('嵌套表格不会破坏外层表格结构', () => {
  const { convert } = bootstrap(
    '<table><tr><th>A</th></tr><tr><td><table><tr><td>inner1</td></tr><tr><td>inner2</td></tr></table></td></tr></table>'
  );
  const lines = convert().split('\n').filter((line) => line.startsWith('|'));
  assert.equal(lines.length, 3, '外层表格应只有表头 / 分隔行 / 一行数据');
  assert.match(lines[2], /\| inner1inner2 \|/);
});

test('500 层嵌套 DOM 不爆栈且耗时可控', () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { onMessage: { addListener() {} } } };
  dom.window.eval(CONTENT);

  let node = dom.window.document.body;
  for (let i = 0; i < 500; i++) {
    const div = dom.window.document.createElement('div');
    node.appendChild(div);
    node = div;
  }
  node.textContent = 'deep-text';

  const range = dom.window.document.createRange();
  range.setStart(dom.window.document.body, 0);
  range.setEnd(dom.window.document.body, dom.window.document.body.childNodes.length);

  const started = Date.now();
  const out = dom.window.__copyAsMarkdown.convertToMarkdown(
    { rangeCount: 1, isCollapsed: false, getRangeAt: () => range, toString: () => 'deep-text' },
    SETTINGS
  );
  const elapsed = Date.now() - started;

  assert.match(out, /deep-text/);
  assert.ok(elapsed < 500, `500 层嵌套耗时 ${elapsed}ms，超过 500ms`);
});
