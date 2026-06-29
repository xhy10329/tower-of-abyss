/* === save.js: 存档系统（localStorage）===
 * 把游戏状态 G 序列化保存，玩家退出后可继续。
 * G 中绝大部分是可序列化的（数字、字符串、纯对象数组）。
 * 唯一的引用类型是 G.character —— 保存时只存 charId，读取时重新关联。
 */
(function (global) {
  'use strict';

  const SAVE_KEY = 'toa_savegame';
  const SAVE_VERSION = 1;

  // 不需要保存的瞬时字段（每场战斗会重建）
  const TRANSIENT = ['character']; // character 用 charId 重建

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  // 是否有「可续关」的存档：游戏进行中（在地图上、未结束）
  function hasResumableSave() {
    const data = peek();
    return !!(data && data.G && data.G.charId && data.G.hp > 0 && !data.finished);
  }

  function peek() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  // 保存当前 G。phase 标记当前所处阶段（'map' 最适合续关）。
  function save(G, opts) {
    opts = opts || {};
    try {
      const clone = {};
      for (const k in G) {
        if (TRANSIENT.includes(k)) continue;
        clone[k] = G[k];
      }
      const payload = {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        finished: !!opts.finished,
        phase: opts.phase || (G.currentPhase || 'map'),
        G: clone,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[save] 保存失败', e);
      return false;
    }
  }

  // 读取存档并重建可用的 G（重新关联 character）。
  // 依赖全局 CHARACTERS（来自 data.js）。
  function load() {
    const data = peek();
    if (!data || !data.G) return null;
    if (data.version !== SAVE_VERSION) {
      console.info('[save] 存档版本不匹配，已忽略旧存档。');
      return null;
    }
    const G = data.G;
    // 重新关联角色对象（CHARACTERS 在同一脚本作用域中，直接引用）
    if (G.charId && typeof CHARACTERS !== 'undefined' && CHARACTERS[G.charId]) {
      G.character = CHARACTERS[G.charId];
    }
    return { G: G, phase: data.phase };
  }

  function clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  function savedAtText() {
    const data = peek();
    if (!data || !data.savedAt) return '';
    const d = new Date(data.savedAt);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 存档摘要（用于「继续游戏」按钮显示）
  function summary() {
    const data = peek();
    if (!data || !data.G) return null;
    const g = data.G;
    const charName = (typeof CHARACTERS !== 'undefined' && CHARACTERS[g.charId])
      ? CHARACTERS[g.charId].name : g.charId;
    return {
      charName,
      floor: g.floor,
      hp: g.hp, maxHp: g.maxHp,
      awakened: g.awakened,
      awakeningLevel: g.awakeningLevel,
      savedAt: savedAtText(),
    };
  }

  global.SaveSystem = { hasSave, hasResumableSave, save, load, clear, summary, savedAtText };
})(window);
