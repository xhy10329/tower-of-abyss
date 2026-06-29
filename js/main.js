/* === main.js: 启动引导 + 存档/音效整合 ===
 * 这里集中放置「界面入口」函数，并把存档、音效系统接入关键节点。
 * 依赖：data.js（CHARACTERS 等）、game.js（核心流程）、save.js、audio.js
 */

// ---------- 角色选择 ----------
function showCharacterSelect(){
  renderCharacterCards();
  showScreen('select-screen');
  if (window.Audio2) Audio2.playBgm('map');
}

function renderCharacterCards(){
  const grid=document.getElementById('char-grid');
  grid.innerHTML='';
  Object.values(CHARACTERS).forEach(char=>{
    const card=document.createElement('div');
    card.className='char-card';
    card.style.setProperty('--char-accent', char.accent);
    card.style.setProperty('--char-accent-dim', char.accentDim);
    card.style.setProperty('--char-glow', char.glow);
    card.innerHTML=`
      <div class="char-icon">${char.icon}</div>
      <div class="char-name">${char.name}</div>
      <div class="char-epithet">${char.epithet}</div>
      <div class="char-stats-row">
        <div class="char-stat"><span class="char-stat-val hp">${char.maxHp}</span><span class="char-stat-lbl">生命</span></div>
        <div class="char-stat"><span class="char-stat-val san">${char.maxSan}</span><span class="char-stat-lbl">理智</span></div>
      </div>
      <div class="char-passive">
        <div class="char-passive-name">⟡ ${char.passiveName}</div>
        <div class="char-passive-desc">${char.passiveDesc}</div>
      </div>
      <div class="char-flavor">${char.flavor}</div>
      <div class="char-deck-hint">${char.deckHint}</div>
      <button class="char-select-btn">选择 ${char.name}</button>
    `;
    card.onclick=()=>{ if(window.Audio2) Audio2.play('select'); selectCharacter(char.id); };
    grid.appendChild(card);
  });
}

function selectCharacter(charId){
  document.body.classList.remove('awakened');
  initState(charId);
  generateMap();
  if (window.SaveSystem) SaveSystem.save(G, { phase: 'map' }); // 开局即存档
  showScreen('map-screen');
  renderMap();
}

// 从存档继续
function continueGame(){
  if (!window.SaveSystem) return;
  const loaded = SaveSystem.load();
  if (!loaded || !loaded.G){ showCharacterSelect(); return; }
  G = loaded.G;
  // 觉醒视觉状态恢复
  if (G.awakened) document.body.classList.add('awakened');
  else document.body.classList.remove('awakened');
  generateMapIfMissing();
  showScreen('map-screen');
  renderMap();
}

// 旧存档可能没有完整 mapNodes（理论上有），保险起见
function generateMapIfMissing(){
  if (!G.mapNodes || !G.mapNodes.length) generateMap();
}

// 「踏入深渊」：有可续存档则进标题的继续按钮逻辑，否则直接选人
function startGame(){
  showCharacterSelect();
}

// ---------- 标题界面的存档提示 ----------
function refreshTitleSaveButton(){
  const btn = document.getElementById('continue-btn');
  if (!btn || !window.SaveSystem) return;
  if (SaveSystem.hasResumableSave()){
    const s = SaveSystem.summary();
    btn.style.display = '';
    btn.textContent = `继续游戏 · ${s.charName} 第${s.floor}层`;
  } else {
    btn.style.display = 'none';
  }
}

// ---------- 音效开关按钮 ----------
function toggleAudioBtn(){
  if (!window.Audio2) return;
  const m = Audio2.toggleMute();
  const btn = document.getElementById('mute-btn');
  if (btn) btn.textContent = m ? '🔇' : '🔊';
}

// ---------- 初始化 ----------
window.addEventListener('DOMContentLoaded', () => {
  if (window.Audio2) Audio2.init();
  refreshTitleSaveButton();
  const mb = document.getElementById('mute-btn');
  if (mb && window.Audio2) mb.textContent = Audio2.isMuted() ? '🔇' : '🔊';
});
