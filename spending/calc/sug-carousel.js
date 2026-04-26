/**
 * 提案カルーセルの状態管理（UI層から分離・テスト可能）
 * - all:       全提案IDの順序付き配列
 * - minimized: 最小化中のIDセット（セッション内のみ保持）
 * - idx:       activeList 内の現在表示インデックス
 */
export function createSugCarousel() {
  let _all = [];
  let _min = new Set();
  let _idx = 0;

  function _activeList() {
    return _all.filter(id => !_min.has(id));
  }

  function _clampIdx() {
    const len = _activeList().length;
    if (len === 0) { _idx = 0; return; }
    if (_idx >= len) _idx = len - 1;
  }

  function setAll(ids) {
    for (const id of _min) {
      if (!ids.includes(id)) _min.delete(id);
    }
    _all = [...ids];
    _clampIdx();
  }

  function minimize(id) {
    if (!_all.includes(id)) return;
    _min.add(id);
    _clampIdx();
  }

  function expand(id) {
    if (!_all.includes(id)) return;
    _min.delete(id);
    const active = _activeList();
    const pos = active.indexOf(id);
    if (pos >= 0) _idx = pos;
    _clampIdx();
  }

  function nav(dir) {
    const active = _activeList();
    if (active.length === 0) return;
    _idx = Math.max(0, Math.min(active.length - 1, _idx + dir));
  }

  function state() {
    const active = _activeList();
    return {
      all: [..._all],
      active,
      minimized: _all.filter(id => _min.has(id)),
      idx: _idx,
      current: active[_idx] ?? null,
    };
  }

  return { setAll, minimize, expand, nav, state };
}
