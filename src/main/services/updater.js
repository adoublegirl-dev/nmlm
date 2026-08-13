// 更新模块：检查 GitHub/JSON manifest、下载、SHA256 校验、用户确认后启动安装器。
const { app, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const settings = require('./settings')
const lifecycle = require('./lifecycle')

let state = { status: 'idle', progress: 0, currentVersion: null, latest: null, error: null, downloadedPath: null, checkedAt: null }
function snapshot() { return { ok: true, ...state, currentVersion: app.getVersion() } }
function requireHttps(url) {
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error('更新地址必须使用 HTTPS')
  return u.toString()
}
async function fetchJson(url) {
  const res = await fetch(requireHttps(url), { headers: { 'User-Agent': 'Niuma-Union-Updater', Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`更新服务返回 HTTP ${res.status}`)
  return res.json()
}
async function resolveGithubRelease(release) {
  const assets = release.assets || []
  const installer = assets.find((x) => /\.exe$/i.test(x.name) && /setup/i.test(x.name)) || assets.find((x) => /\.exe$/i.test(x.name))
  if (!installer) throw new Error('最新 Release 中没有找到 Windows 安装包')
  let sha256 = String(installer.digest || '').replace(/^sha256:/i, '') || null
  if (!sha256) {
    const checksum = assets.find((x) => /sha256|checksums?/i.test(x.name))
    if (checksum) {
      const text = await (await fetch(requireHttps(checksum.browser_download_url), { headers: { 'User-Agent': 'Niuma-Union-Updater' } })).text()
      const line = text.split(/\r?\n/).find((x) => x.includes(installer.name))
      sha256 = line?.match(/[a-f0-9]{64}/i)?.[0] || null
    }
  }
  if (!sha256) sha256 = String(release.body || '').match(/SHA256[^a-f0-9]*([a-f0-9]{64})/i)?.[1] || null
  return {
    version: String(release.tag_name || release.name || '').replace(/^v/, ''),
    notes: release.body || '', publishedAt: release.published_at || null,
    url: installer.browser_download_url, filename: installer.name, sha256
  }
}
async function check() {
  state = { ...state, status: 'checking', progress: 0, error: null, currentVersion: app.getVersion() }
  try {
    const manifestUrl = settings.get('update.manifestUrl')
    if (!manifestUrl) throw new Error('未配置更新地址')
    const data = await fetchJson(manifestUrl)
    const latest = data.tag_name || data.assets ? await resolveGithubRelease(data) : data
    if (!latest.version || !latest.url) throw new Error('更新清单缺少 version 或 url')
    latest.url = requireHttps(latest.url)
    latest.available = lifecycle.compareVersions(latest.version, app.getVersion()) > 0
    state = { ...state, status: latest.available ? 'available' : 'up-to-date', latest, checkedAt: Date.now(), error: null }
    settings.set('update.lastCheckedAt', state.checkedAt)
    return snapshot()
  } catch (e) {
    state = { ...state, status: 'error', error: e.message, checkedAt: Date.now() }
    return { ...snapshot(), ok: false }
  }
}
async function download() {
  if (!state.latest?.available) return { ok: false, error: '没有可下载的新版本' }
  if (!state.latest.sha256 || !/^[a-f0-9]{64}$/i.test(state.latest.sha256)) return { ok: false, error: '更新包缺少可信 SHA256，已拒绝下载' }
  const dir = path.join(app.getPath('userData'), 'updates')
  fs.mkdirSync(dir, { recursive: true })
  const filename = path.basename(state.latest.filename || `牛马联盟-Setup-${state.latest.version}.exe`).replace(/[^\w.\-\u4e00-\u9fa5]/g, '_')
  const finalPath = path.join(dir, filename)
  const tempPath = finalPath + '.download'
  state = { ...state, status: 'downloading', progress: 0, error: null, downloadedPath: null }
  try {
    const res = await fetch(requireHttps(state.latest.url), { headers: { 'User-Agent': 'Niuma-Union-Updater' } })
    if (!res.ok || !res.body) throw new Error(`下载安装包失败：HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length') || 0)
    const file = fs.createWriteStream(tempPath)
    const reader = res.body.getReader()
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      file.write(Buffer.from(value))
      received += value.byteLength
      state.progress = total ? Math.round(received / total * 100) : 0
    }
    await new Promise((resolve, reject) => { file.end(resolve); file.on('error', reject) })
    const digest = crypto.createHash('sha256').update(fs.readFileSync(tempPath)).digest('hex')
    if (digest.toLowerCase() !== state.latest.sha256.toLowerCase()) throw new Error('更新包 SHA256 校验失败，文件已丢弃')
    fs.renameSync(tempPath, finalPath)
    state = { ...state, status: 'downloaded', progress: 100, downloadedPath: finalPath, error: null }
    return snapshot()
  } catch (e) {
    try { fs.rmSync(tempPath, { force: true }) } catch (_) {}
    state = { ...state, status: 'error', error: e.message, downloadedPath: null }
    return { ...snapshot(), ok: false }
  }
}
async function install() {
  if (!state.downloadedPath || !fs.existsSync(state.downloadedPath)) return { ok: false, error: '没有已校验的更新包' }
  await shell.openPath(state.downloadedPath)
  setTimeout(() => app.quit(), 800)
  return { ok: true }
}

module.exports = { check, download, install, status: snapshot }
