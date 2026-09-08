// 标签生命周期：新记录只使用启用标签；停用标签继续保留历史统计。
const ledger = require('./ledger')
const { tagsRepo } = require('../db')

function assertIdle() {
  if (ledger.current()) throw new Error('正在记录中，请先停止记录后再增删工作类型')
}

function list() {
  return { ok: true, tags: tagsRepo.allActive() }
}

function listAll() {
  return { ok: true, tags: tagsRepo.all() }
}

function create(args = {}) {
  assertIdle()
  return { ok: true, tag: tagsRepo.create(args), restartRequired: true }
}

function update(args = {}) {
  return { ok: true, tag: tagsRepo.update(args.id, args) }
}

function archive(args = {}) {
  assertIdle()
  return { ok: true, removed: tagsRepo.archive(args.id), restartRequired: true }
}

module.exports = { list, listAll, create, update, archive, assertIdle }
