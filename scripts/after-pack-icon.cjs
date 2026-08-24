// electron-builder afterPack hook.
// Why this exists:
// - win.signAndEditExecutable=true would normally set the exe icon, but on this Windows
//   machine electron-builder's winCodeSign archive extraction fails on macOS symlinks.
// - Keeping signAndEditExecutable=false avoids that failure, but leaves the packaged exe
//   with the default Electron icon.
// - This hook injects the icon with rcedit after the exe is packed and before NSIS builds
//   the installer, without invoking the full winCodeSign extraction path.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

function walk(dir, out = []) {
  if (!dir || !fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    let st
    try { st = fs.statSync(p) } catch (_) { continue }
    if (st.isDirectory()) walk(p, out)
    else if (/rcedit-x64\.exe$/i.test(name) || /^rcedit\.exe$/i.test(name)) out.push({ path: p, mtime: st.mtimeMs })
  }
  return out
}

function findRcedit(projectDir) {
  // Priority matters: electron-winstaller's old rcedit.exe can fail on Chinese paths.
  // The winCodeSign rcedit-x64.exe extracted by electron-builder works here even when
  // the full winCodeSign archive extraction reports macOS symlink errors.
  const groups = []
  if (process.env.RCEDIT_PATH) groups.push([{ path: process.env.RCEDIT_PATH, mtime: Number.MAX_SAFE_INTEGER }])
  if (process.env.LOCALAPPDATA) groups.push(walk(path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign')).filter((x) => /rcedit-x64\.exe$/i.test(x.path)))
  groups.push(walk(path.join(projectDir, 'node_modules')).filter((x) => /rcedit-x64\.exe$/i.test(x.path)))
  if (process.env.LOCALAPPDATA) groups.push(walk(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx')))
  for (const group of groups) {
    const found = group
      .filter((x) => x.path && fs.existsSync(x.path))
      .sort((a, b) => b.mtime - a.mtime)[0]?.path
    if (found) return found
  }
  return null
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const projectDir = context.packager.projectDir
  const productFilename = context.packager.appInfo.productFilename || context.packager.appInfo.productName
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`)
  const iconPath = path.join(projectDir, 'build', 'icon.ico')
  if (!fs.existsSync(exePath)) throw new Error(`[after-pack-icon] Missing exe: ${exePath}`)
  if (!fs.existsSync(iconPath)) throw new Error(`[after-pack-icon] Missing icon: ${iconPath}`)
  const rcedit = findRcedit(projectDir)
  if (!rcedit) throw new Error('[after-pack-icon] rcedit not found. Run a previous electron-builder attempt or set RCEDIT_PATH.')
  console.log(`[after-pack-icon] Injecting icon into ${exePath}`)
  execFileSync(rcedit, [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', context.packager.appInfo.description || '牛马联盟',
    '--set-version-string', 'ProductName', context.packager.appInfo.productName || '牛马联盟'
  ], { stdio: 'inherit' })
}
