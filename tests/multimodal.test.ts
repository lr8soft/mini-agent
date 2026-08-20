// ============================================================
// multimodal.ts 单元测试 — 直接 node 运行（Node 22+ type stripping）
//   npm test  或  node tests/multimodal.test.ts
// ============================================================
import { buildUserContent, extractTextContent, countImages } from '../src/shared/multimodal.ts'
import type { ChatMessage } from '../src/shared/types.ts'

let passed = 0
let failed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${(err as Error).message}`)
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}
function assertEq(a: unknown, b: unknown, msg: string) {
  if (a !== b) throw new Error(`${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`)
}

const IMG = 'data:image/png;base64,AAAA'
const IMG2 = 'data:image/jpeg;base64,BBBB'

// ============================================================
console.log('\nbuildUserContent')
// ============================================================

test('无图片 → 返回纯字符串（兼容旧格式）', () => {
  const c = buildUserContent('你好')
  assertEq(c, '你好', '返回原字符串')
})

test('空图片数组 → 返回纯字符串', () => {
  const c = buildUserContent('你好', [])
  assertEq(c, '你好', '返回原字符串')
})

test('有图片无文本 → ContentPart[] 仅含图片', () => {
  const c = buildUserContent('   ', [IMG])
  assert(Array.isArray(c), '返回数组')
  assertEq(c.length, 1, '1 个 part')
  assertEq(c[0].type, 'image_url', 'image part')
})

test('有文本有图片 → text 在前，图片在后', () => {
  const c = buildUserContent('看图', [IMG, IMG2])
  assert(Array.isArray(c), '返回数组')
  assertEq(c.length, 3, '1 text + 2 image')
  assertEq(c[0].type, 'text', 'text 在前')
  assertEq(c[0].type === 'text' ? c[0].text : '', '看图', '文本内容')
  assertEq(c[1].type, 'image_url', '第 1 张图')
  assertEq(c[2].type, 'image_url', '第 2 张图')
  assertEq(c[1].type === 'image_url' ? c[1].image_url.url : '', IMG, 'url 原样')
})

test('images 含空字符串 → 跳过空值', () => {
  const c = buildUserContent('hi', ['', IMG])
  assert(Array.isArray(c), '返回数组')
  const imgs = c.filter(p => p.type === 'image_url')
  assertEq(imgs.length, 1, '空 URL 被过滤')
})

// ============================================================
console.log('\nextractTextContent')
// ============================================================

test('字符串 → 原样返回', () => {
  assertEq(extractTextContent('abc'), 'abc', '原样')
})

test('null / undefined → 空字符串', () => {
  assertEq(extractTextContent(null), '', 'null')
  assertEq(extractTextContent(undefined), '', 'undefined')
})

test('多模态数组 → 仅拼接 text 部分', () => {
  const c: ChatMessage['content'] = [
    { type: 'text', text: '第一句' },
    { type: 'image_url', image_url: { url: IMG } },
    { type: 'text', text: '第二句' }
  ]
  assertEq(extractTextContent(c), '第一句\n第二句', 'text 用换行拼接')
})

test('纯图片数组 → 空字符串', () => {
  const c: ChatMessage['content'] = [{ type: 'image_url', image_url: { url: IMG } }]
  assertEq(extractTextContent(c), '', '无文本')
})

// ============================================================
console.log('\ncountImages')
// ============================================================

test('字符串 content → 0', () => {
  assertEq(countImages('abc'), 0, '无图')
})

test('多模态数组 → 图片数', () => {
  const c: ChatMessage['content'] = [
    { type: 'text', text: 'x' },
    { type: 'image_url', image_url: { url: IMG } },
    { type: 'image_url', image_url: { url: IMG2 } }
  ]
  assertEq(countImages(c), 2, '2 张图')
})

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
