// Deterministic release preflight. Exits non-zero on unsafe packaging conditions.
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const failures = []
const config = fs.readFileSync(path.join(root, 'electron-builder.release.yml'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (!config.includes('appId: com.niuma.union')) failures.push('appId must remain com.niuma.union')
if (!config.includes('productName: 牛马联盟')) failures.push('productName must remain 牛马联盟')
if (!config.includes('deleteAppDataOnUninstall: false')) failures.push('uninstall must preserve AppData by default')
if (!config.includes('allowToChangeInstallationDirectory: true')) failures.push('installer must allow installation directory selection')
if (!config.includes('buildResources: build')) failures.push('build resources must be reproducible from source-controlled build/')
if (!config.includes('include: build/installer.nsh')) failures.push('NSIS include must come from build/installer.nsh')
if (!fs.existsSync(path.join(root, 'build', 'icon.ico'))) failures.push('missing build/icon.ico')
if (!fs.existsSync(path.join(root, 'build', 'installer.nsh'))) failures.push('missing build/installer.nsh')
if (!pkg.version || !/^\d+\.\d+\.\d+/.test(pkg.version)) failures.push('package version must be semantic')
function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'release', '.git'].includes(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p)); else out.push(p)
  }
  return out
}
const unsafe = walk(root).filter((p) => /(?:^|\\)(?:niuma\.db|.*\.sqlite3?|.*\.db)$/i.test(p) || /牛马联盟证据库|screenshots/i.test(p))
if (unsafe.length) failures.push('unsafe user data in source tree: ' + unsafe.join(', '))
if (failures.length) {
  console.error('[release-preflight] FAILED')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}
console.log('[release-preflight] OK')
console.log(` version=${pkg.version}`)
console.log(' appId=com.niuma.union')
console.log(' userData excluded')
