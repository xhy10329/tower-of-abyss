/* === audio.js: 音效与背景音乐管理 ===
 * 使用 Howler.js。设计为「优雅降级」：即便音频文件缺失或 Howler 未加载，
 * 游戏也能正常运行（所有调用变为无操作）。
 * 你只需把音频文件放进 assets/audio/ 即可自动启用。
 */
(function (global) {
  'use strict';

  const HAS_HOWLER = typeof global.Howl !== 'undefined';

  // 音效配置：key -> 文件路径。文件不存在时静默跳过。
  const SFX_FILES = {
    card:    'assets/audio/card.mp3',     // 出牌
    attack:  'assets/audio/attack.mp3',   // 攻击命中
    shield:  'assets/audio/shield.mp3',   // 获得护盾
    hurt:    'assets/audio/hurt.mp3',     // 玩家受伤
    heal:    'assets/audio/heal.mp3',     // 回复
    awaken:  'assets/audio/awaken.mp3',   // 觉醒
    victory: 'assets/audio/victory.mp3',  // 胜利
    defeat:  'assets/audio/defeat.mp3',   // 失败
    select:  'assets/audio/select.mp3',   // 选择/点击
  };

  const BGM_FILES = {
    map:    'assets/audio/bgm_map.mp3',
    battle: 'assets/audio/bgm_battle.mp3',
    awaken: 'assets/audio/bgm_awaken.mp3',
  };

  const sfx = {};
  const bgm = {};
  let currentBgm = null;
  let muted = false;
  let volume = 0.6;

  function init() {
    if (!HAS_HOWLER) {
      console.info('[audio] Howler 未加载，音频功能已禁用（游戏正常运行）。');
      return;
    }
    for (const key in SFX_FILES) {
      try {
        sfx[key] = new global.Howl({ src: [SFX_FILES[key]], volume: volume, preload: true });
      } catch (e) { /* 文件缺失时忽略 */ }
    }
    for (const key in BGM_FILES) {
      try {
        bgm[key] = new global.Howl({ src: [BGM_FILES[key]], volume: volume * 0.5, loop: true, preload: false });
      } catch (e) { /* 文件缺失时忽略 */ }
    }
    // 从存档读取静音/音量偏好
    try {
      const pref = JSON.parse(localStorage.getItem('toa_audio') || '{}');
      if (typeof pref.muted === 'boolean') muted = pref.muted;
      if (typeof pref.volume === 'number') volume = pref.volume;
    } catch (e) {}
  }

  function play(key) {
    if (muted || !HAS_HOWLER || !sfx[key]) return;
    try { sfx[key].play(); } catch (e) {}
  }

  function playBgm(key) {
    if (!HAS_HOWLER) return;
    if (currentBgm === key) return;
    stopBgm();
    currentBgm = key;
    if (muted || !bgm[key]) return;
    try { bgm[key].play(); } catch (e) {}
  }

  function stopBgm() {
    if (!HAS_HOWLER) return;
    for (const key in bgm) { try { bgm[key].stop(); } catch (e) {} }
    currentBgm = null;
  }

  function setMuted(v) {
    muted = !!v;
    if (muted) stopBgm();
    else if (currentBgm) { const c = currentBgm; currentBgm = null; playBgm(c); }
    persist();
  }

  function toggleMute() { setMuted(!muted); return muted; }
  function isMuted() { return muted; }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (HAS_HOWLER && global.Howler) { try { global.Howler.volume(volume); } catch (e) {} }
    persist();
  }

  function persist() {
    try { localStorage.setItem('toa_audio', JSON.stringify({ muted, volume })); } catch (e) {}
  }

  global.Audio2 = { init, play, playBgm, stopBgm, setMuted, toggleMute, isMuted, setVolume };
})(window);
