// 记录中以服务端返回的活动时间段标签为唯一权威源；空闲时才使用用户预选标签。
export function resolveSelectedTagId(current, fallbackId = null) {
  if (!current) return fallbackId == null ? null : Number(fallbackId)
  const activeId = current.active_tag_id ?? current.tag_id
  return activeId == null ? null : Number(activeId)
}
