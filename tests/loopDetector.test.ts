// ============================================================
// loopDetector.ts 单元测试 — node tests/loopDetector.test.ts
// ============================================================
import { LoopDetector, toolCallSignature, DEFAULT_LOOP_CONFIG } from '../src/main/agent/loopDetector.ts'

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
  if (a !== b) throw new Error(`${msg} — got ${a}, want ${b}`)
}

// ============================================================
console.log('\ntoolCallSignature')
// ============================================================

test('相同参数不同顺序 → 签名相同（key 排序归一化）', () => {
  const a = toolCallSignature('bash', '{"command":"ls","timeout":10}')
  const b = toolCallSignature('bash', '{"timeout":10,"command":"ls"}')
  assertEq(a, b, 'key 顺序不影响签名')
})

test('参数不同 → 签名不同', () => {
  const a = toolCallSignature('bash', '{"command":"ls"}')
  const b = toolCallSignature('bash', '{"command":"pwd"}')
  assert(a !== b, '不同参数签名不同')
})

test('工具名不同 → 签名不同（即使参数相同）', () => {
  const a = toolCallSignature('read', '{}')
  const b = toolCallSignature('write', '{}')
  assert(a !== b, '工具名参与签名')
})

test('嵌套对象参数 → 深度排序归一化', () => {
  const a = toolCallSignature('x', '{"b":{"z":1,"y":2},"a":[3,4]}')
  const b = toolCallSignature('x', '{"a":[3,4],"b":{"y":2,"z":1}}')
  assertEq(a, b, '嵌套 key 顺序不影响签名')
})

test('空参数 → 稳定签名', () => {
  assertEq(toolCallSignature('browser_close', ''), toolCallSignature('browser_close', '{}'), '空字符串与 {} 等价')
})

test('非法 JSON 参数 → 原样使用不抛错', () => {
  const a = toolCallSignature('bash', 'not-json{{{')
  const b = toolCallSignature('bash', 'not-json{{{')
  assertEq(a, b, '非法 JSON 相同原文 → 相同签名')
  const c = toolCallSignature('bash', 'different{{{')
  assert(a !== c, '非法 JSON 不同原文 → 不同签名')
})

// ============================================================
console.log('\nLoopDetector.inspect')
// ============================================================

test('默认阈值：第 1-2 次 ok，第 3 次 soft，第 5 次起 hard', () => {
  const d = new LoopDetector()
  const calls = ['a', 'b', 'c', 'd', 'e'].map(i => d.inspect('bash', `{"command":"cmd${i}"}`))
  // 全不同 → 全 ok
  assert(calls.every(v => v.kind === 'ok'), '不同调用不触发')

  const same = []
  for (let i = 0; i < 6; i++) same.push(d.inspect('edit', '{"file":"x","old":"a"}'))
  assertEq(same[0].kind, 'ok', '第 1 次 ok')
  assertEq(same[1].kind, 'ok', '第 2 次 ok')
  assertEq(same[2].kind, 'soft', '第 3 次 soft')
  assertEq(same[3].kind, 'soft', '第 4 次 soft')
  assertEq(same[4].kind, 'hard', '第 5 次 hard')
  assertEq(same[5].kind, 'hard', '第 6 次仍 hard')
  assertEq(same[5].count, 6, '连续计数 6')
})

test('插入一次不同调用 → 连续计数重置', () => {
  const d = new LoopDetector()
  d.inspect('read', '{"f":"a"}')
  d.inspect('read', '{"f":"a"}')           // count=2
  d.inspect('ls', '{}')                     // 打断
  d.inspect('read', '{"f":"a"}')            // count 重置为 1
  assertEq(d.inspect('read', '{"f":"a"}').kind, 'ok', '重置后第 2 次仍 ok')
})

test('自定义阈值生效', () => {
  const d = new LoopDetector()
  const cfg = { softThreshold: 2, hardThreshold: 3 }
  assertEq(d.inspect('x', '{}').kind, 'ok', '第 1 次 ok')
  assertEq(d.inspect('x', '{}', cfg).kind, 'soft', '第 2 次 soft（阈值2）')
  assertEq(d.inspect('x', '{}', cfg).kind, 'hard', '第 3 次 hard（阈值3）')
})

test('count 字段正确暴露', () => {
  const d = new LoopDetector()
  assertEq(d.inspect('t', '{}').count, 1, 'count=1')
  assertEq(d.inspect('t', '{}').count, 2, 'count=2')
})

test('DEFAULT_LOOP_CONFIG 为 3/5（对齐 Cline）', () => {
  assertEq(DEFAULT_LOOP_CONFIG.softThreshold, 3, 'soft=3')
  assertEq(DEFAULT_LOOP_CONFIG.hardThreshold, 5, 'hard=5')
})

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
