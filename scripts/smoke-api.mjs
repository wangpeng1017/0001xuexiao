// 接口级业务链路冒烟（不开浏览器）：node scripts/smoke-api.mjs <baseUrl> <adminInitPassword>
// 每一步打印 PASS/FAIL，任一失败退出码为 1
const [baseUrl = 'http://localhost:3901', adminInitPassword = 'Admin12345'] = process.argv.slice(2)
const API = `${baseUrl}/api/goview`
const results = []

async function call(method, path, { token, json, form } = {}) {
  const headers = {}
  if (token) headers.Authorization = token
  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    body = new URLSearchParams(form).toString()
  }
  const res = await fetch(`${API}/${path}`, { method, headers, body })
  return res.json()
}

async function step(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true })
    console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    results.push({ name, ok: false })
    console.log(`  [FAIL] ${name} — ${error.message}`)
  }
}

function expectCode(body, code, label) {
  if (body.code !== code) throw new Error(`${label} 期望 code ${code}，实际 ${body.code}：${body.msg}`)
  return body
}

async function login(username, password) {
  const body = expectCode(await call('POST', 'sys/login', { json: { username, password } }), 200, '登录')
  return { token: body.data.token.tokenValue, mustChangePwd: body.data.userinfo.mustChangePwd }
}

const NEW_PWD = 'Smoke2026x'
let admin
let student
let projectId

await step('健康检查', async () => {
  const body = expectCode(await call('GET', 'health'), 200, 'health')
  return `version ${body.data.version}`
})

await step('admin 首次登录被要求改密码，改密后可用', async () => {
  const first = await login('admin', adminInitPassword)
  if (!first.mustChangePwd) throw new Error('admin 首次登录应当 mustChangePwd=true')
  expectCode(await call('GET', 'project/list?page=1&limit=10', { token: first.token }), 887, '改密前访问项目')
  expectCode(await call('POST', 'sys/changePassword', { token: first.token, json: { oldPassword: adminInitPassword, newPassword: NEW_PWD } }), 200, '改密')
  admin = (await login('admin', NEW_PWD)).token
})

await step('admin 新建学生账号，学生改密后登录', async () => {
  const created = expectCode(await call('POST', 'user/create', { token: admin, json: { username: 'smoke_stu', nickname: '冒烟学生', role: 'student' } }), 200, '建用户')
  const first = await login('smoke_stu', created.data.initialPassword)
  expectCode(await call('POST', 'sys/changePassword', { token: first.token, json: { oldPassword: created.data.initialPassword, newPassword: NEW_PWD } }), 200, '学生改密')
  student = (await login('smoke_stu', NEW_PWD)).token
})

await step('学生按 GoView 原样参数新建大屏（含 null 字段）并保存', async () => {
  const created = expectCode(await call('POST', 'project/create', { token: student, json: { projectName: 'smoke-screen', remarks: null, indexImage: null } }), 200, '新建')
  projectId = created.data.id
  const detail = expectCode(await call('GET', `project/getData?projectId=${projectId}`, { token: student }), 200, '读取')
  const form = { projectId, content: JSON.stringify({ componentList: [{ key: 'BarCommon' }] }) }
  if (detail.data.version !== undefined) form.version = String(detail.data.version)
  expectCode(await call('POST', 'project/save/data', { token: student, form }), 200, '保存')
})

await step('未发布时匿名读取拿不到内容', async () => {
  const body = expectCode(await call('GET', `project/getData?projectId=${projectId}`), 200, '匿名读取')
  if (body.data.state !== -1 || body.data.content) throw new Error('未发布项目泄露了内容')
})

await step('发布后匿名可读，取消发布后不可读', async () => {
  expectCode(await call('PUT', 'project/publish', { token: student, json: { id: projectId, state: 1 } }), 200, '发布')
  const pub = expectCode(await call('GET', `project/getData?projectId=${projectId}`), 200, '发布后匿名读取')
  if (!pub.data.content.includes('BarCommon')) throw new Error('发布后匿名读取没有拿到内容')
  expectCode(await call('PUT', 'project/publish', { token: student, json: { id: projectId, state: -1 } }), 200, '取消发布')
  const unpub = await call('GET', `project/getData?projectId=${projectId}`)
  if (unpub.data.state !== -1) throw new Error('取消发布后仍可匿名读取')
})

await step('支持格式 ≥ 200 种', async () => {
  const body = expectCode(await call('GET', 'datafile/formats', { token: student }), 200, 'formats')
  if (body.data.total < 200) throw new Error(`只有 ${body.data.total} 种`)
  return `${body.data.total} 种`
})

await step('RESTful 数据集经公开出口取数', async () => {
  const created = expectCode(await call('POST', 'dataset/create', { token: student, json: { name: 'smoke-http', type: 'http', config: { url: `${API}/health`, method: 'GET', headers: {}, body: '', dataPath: 'data' } } }), 200, '建数据集')
  const body = expectCode(await call('GET', `open/dataset/${created.data.id}/data`), 200, '公开出口')
  if (body.data?.status !== 'ok') throw new Error(`取数结果不对：${JSON.stringify(body.data)}`)
})

await step('学生不能访问用户管理', async () => {
  expectCode(await call('GET', 'user/list?page=1&limit=10', { token: student }), 403, '越权')
})

await step('删除大屏后从列表消失', async () => {
  expectCode(await call('DELETE', `project/delete?ids=${projectId}`, { token: student }), 200, '删除')
  const list = expectCode(await call('GET', 'project/list?page=1&limit=50', { token: student }), 200, '列表')
  if (list.data.some((p) => p.id === projectId)) throw new Error('删除后仍在列表中')
})

const failed = results.filter((r) => !r.ok).length
console.log(`\n接口冒烟：${results.length - failed} 通过，${failed} 失败`)
process.exit(failed ? 1 : 0)
