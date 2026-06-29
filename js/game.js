/* 深渊之塔 — 模块化拆分。模块按 index.html 顺序加载，共享全局 G 状态。 */
/* === game.js: 地图/战斗/奖励/事件/渲染 === */
// ===========================================
// MAP
// ===========================================
function generateMap() {
  G.mapNodes = [];
  for(let f=0;f<G.maxFloor;f++){
    const floor = [];
    const count = f===G.maxFloor-1 ? 1 : (f===0 ? 1 : Math.min(3,1+Math.floor(Math.random()*2)));
    for(let i=0;i<count;i++){
      let t;
      if(f===G.maxFloor-1) t='boss';
      else if(f===0) t='battle';
      else { const pool=['battle','battle','battle','event','event']; t=pool[Math.floor(Math.random()*pool.length)]; }
      floor.push({type:t, completed:false, available:f===0});
    }
    G.mapNodes.push(floor);
  }
}

function renderMap() {
  document.getElementById('map-floor').textContent = G.floor;
  const charLine=document.getElementById('map-char-line');
  if(charLine && G.character){ charLine.textContent = `${G.character.icon} ${G.character.name} · ${G.character.passiveName}`; }
  updateMapStats();
  const container = document.getElementById('map-nodes');
  container.innerHTML = '';

  // Awakening banner
  const banner = document.getElementById('map-aw-banner');
  if(G.awakened){
    let txt = `👁 ${AWAKENING_DATA[G.awakeningLevel].tag} — 卡牌已觉醒`;
    const threshold=DESCENT_THRESHOLDS[G.awakeningLevel];
    if(threshold){
      txt += `　｜　沉沦 ${G.descent}/${threshold}（献祭理智以更深觉醒）`;
    }
    banner.textContent = txt;
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }

  for(let f=G.maxFloor-1;f>=0;f--){
    const wrap = document.createElement('div');
    const label = document.createElement('p');
    label.className='floor-label';
    label.textContent = f===G.maxFloor-1 ? '⚠ BOSS层' : `第 ${f+1} 层`;
    wrap.appendChild(label);
    const row = document.createElement('div');
    row.className='map-row';
    G.mapNodes[f].forEach((node,i)=>{
      const el=document.createElement('div');
      el.className='map-node'+(node.completed?' completed':'')+(node.available&&!node.completed?' available':'')+((!node.available)?' locked':'');
      el.innerHTML=`<span class="node-icon">${nodeIcon(node.type)}</span><span class="node-label">${nodeLabel(node.type)}</span>`;
      if(node.available&&!node.completed) el.onclick=()=>enterNode(f,i);
      row.appendChild(el);
    });
    wrap.appendChild(row);
    container.appendChild(wrap);
  }
  document.getElementById('deck-count').textContent = G.deck.length;
}

function nodeIcon(t){ return {battle:'⚔',event:'📖',boss:'👁',shop:'🕯'}[t]||'?'; }
function nodeLabel(t){ return {battle:'战斗',event:'事件',boss:'BOSS',shop:'祭坛'}[t]||'?'; }

function enterNode(floor,idx){
  const node=G.mapNodes[floor][idx];
  node.completed=true;
  if(floor+1<G.maxFloor) G.mapNodes[floor+1].forEach(n=>n.available=true);
  if(node.type==='battle'||node.type==='boss') startBattle(floor);
  else if(node.type==='event') startEvent();
}

// ===========================================
// BATTLE
// ===========================================
function startBattle(floor){
  G.currentPhase='battle';
  G.shield=0; G.strength=0; G.statusEffects=[];
  G.hand=[]; G.discard=[]; G.draw=shuffle([...G.deck]);
  G._nextCardFree=false;

  // Re-apply character innate strength (veteran) — statusEffects was reset
  const passive = G.character?.passive || {};
  if(passive.strengthBonus){ G.statusEffects.push({type:'strength',stacks:passive.strengthBonus}); }
  // Investigator: recover SAN at battle start (only if not awakened)
  if(passive.battleStartSan && !G.awakened){ gainSan(G, passive.battleStartSan); }

  // Bonus shield from events
  if(G._bonusShield){ G.shield=G._bonusShield; G._bonusShield=0; }
  // Permanent strength from events
  if(G._permaStrength){
    const s=G.statusEffects.find(e=>e.type==='strength');
    if(s) s.stacks+=G._permaStrength; else G.statusEffects.push({type:'strength',stacks:G._permaStrength});
  }

  const isBoss = floor>=G.maxFloor-1;
  G.enemies = spawnEnemies(floor, isBoss);
  G.targetIndex = 0; // default target = first living enemy

  // ===== CLARITY REWARD: staying sane grants a battle-start shield =====
  if(!G.awakened){
    const tier=clarityTier(G);
    const startShield=[0,3,4,6][tier];
    if(startShield>0){ G.shield+=startShield; }
  }
  // First-card discount flag (Clarity II+) — refreshed each turn in updateBattleUI
  G._firstCardThisTurn = true;

  // ===== AWAKENING COST (C): the Old Ones have noticed you =====
  // Every awakened battle, enemies gain strength scaling with depth + awakening level.
  if(G.awakened){
    const buff = G.awakeningLevel + Math.floor(floor/3); // deeper + more awakened = stronger foes
    G.enemies.forEach(e=>{
      e.status.push({type:'strength', stacks:buff});
    });
    addLog(`👁 古神注视着你——敌人获得 ${buff} 点力量`,'awakened');
  }

  showScreen('battle-screen');
  if(window.Audio2) Audio2.playBgm(G.awakened?'awaken':'battle');
  G.energy=G.maxEnergy;
  let startDraw = 5;
  if(!G.awakened && clarityTier(G)>=3) startDraw += 1; // Clarity III bonus draw
  if(G._bonusDraw>0){ startDraw += 2; G._bonusDraw--; }
  drawCards(G,startDraw);
  updateBattleUI();
  const names = G.enemies.map(e=>'「'+e.name+'」').join('、');
  addLog('⚔ 遭遇 '+names,'');
  if(!G.awakened && clarityTier(G)>0) addLog(`✦ ${CLARITY_INFO[clarityTier(G)].name}：理智赋予你优势`,'san');
  if(G.enemies.length>1) addLog('点击敌人选择攻击目标','special');
  if(G.awakened) addLog(`👁 觉醒 Lv.${G.awakeningLevel} 激活——卡牌已变异`,'awakened');
}

// Spawn a group of enemies based on floor depth
function spawnEnemies(floor, isBoss){
  if(isBoss){
    const boss = makeEnemy(getBoss());
    // Boss is flanked by a single cultist minion
    const cultist = getNormalEnemies().find(e=>e.id==='cultist');
    return [boss, makeEnemy(cultist)];
  }
  // Enemy pool grows deeper as floors progress
  const normals = getNormalEnemies();
  const poolSize = Math.min(3 + floor, normals.length);
  const pool = normals.slice(0, poolSize);
  // Count scales with floor: early 1-2, mid 2-3, late 3
  let count;
  if(floor <= 1) count = 1 + (Math.random()<0.5?1:0);
  else if(floor <= 4) count = 2 + (Math.random()<0.5?1:0);
  else count = 2 + Math.floor(Math.random()*2);
  count = Math.min(count, 3);
  const group = [];
  for(let i=0;i<count;i++){
    const t = pool[Math.floor(Math.random()*pool.length)];
    const e = makeEnemy(t);
    // Deeper floors: enemies get an HP bump
    if(floor >= 5){ e.hp = Math.round(e.hp*1.25); e.maxHp = e.hp; }
    group.push(e);
  }
  return group;
}

// Build a fresh enemy instance with its own shield/status/actionIndex
function makeEnemy(template){
  const e = JSON.parse(JSON.stringify(template));
  e.maxHp = e.hp;
  e.shield = 0;
  e.status = [];
  e.actionIndex = 0;
  e.uid = 'e'+(Math.random().toString(36).slice(2,8));
  return e;
}

// Get currently selected target (auto-corrects to first living enemy)
function getTarget(){
  if(!G.enemies || G.enemies.length===0) return null;
  let t = G.enemies[G.targetIndex];
  if(!t || t.hp<=0){
    const idx = G.enemies.findIndex(e=>e.hp>0);
    if(idx<0) return null;
    G.targetIndex = idx;
    t = G.enemies[idx];
  }
  return t;
}

function selectTarget(idx){
  if(G.enemies[idx] && G.enemies[idx].hp>0){
    G.targetIndex = idx;
    updateBattleUI();
  }
}

function livingEnemies(){ return G.enemies ? G.enemies.filter(e=>e.hp>0) : []; }

function updateBattleUI(){
  // HP
  setPct('battle-hp-bar', G.hp, G.maxHp);
  document.getElementById('battle-hp-val').textContent=G.hp+'/'+G.maxHp;
  // SAN bar with color state
  setPct('battle-san-bar', G.san, G.maxSan);
  document.getElementById('battle-san-val').textContent=G.san+'/'+G.maxSan;
  const sanBar=document.getElementById('battle-san-bar');
  sanBar.className='stat-bar-fill san-fill';
  if(G.san===0) sanBar.classList.add('zero');
  else if(G.san/G.maxSan < 0.35) sanBar.classList.add('low');

  // Clarity tag — shows the benefit of staying sane
  const clarityTag=document.getElementById('clarity-tag');
  if(clarityTag){
    const tier=clarityTier(G);
    if(!G.awakened && tier>0){
      clarityTag.textContent='✦ '+CLARITY_INFO[tier].name;
      clarityTag.title=CLARITY_INFO[tier].desc;
      clarityTag.classList.add('visible');
    } else {
      clarityTag.classList.remove('visible');
    }
  }

  const mapSanBar=document.getElementById('map-san-bar');
  if(mapSanBar){
    mapSanBar.className='stat-bar-fill san-fill';
    if(G.san===0) mapSanBar.classList.add('zero');
    else if(G.san/G.maxSan < 0.35) mapSanBar.classList.add('low');
  }

  document.getElementById('battle-shield').textContent=G.shield;

  // Enemies — render each as a selectable card
  renderEnemies();

  // Energy orbs
  const orbs=document.getElementById('energy-orbs');
  orbs.innerHTML='';
  for(let i=0;i<G.maxEnergy;i++){
    const o=document.createElement('div');
    o.className='orb'+(i<G.energy?' filled':'');
    orbs.appendChild(o);
  }

  // Awakening badge
  const badge=document.getElementById('aw-level-badge');
  if(G.awakened){
    let txt=`👁 ${AWAKENING_DATA[G.awakeningLevel].name}`;
    const threshold=DESCENT_THRESHOLDS[G.awakeningLevel];
    if(threshold){
      txt += ` · 沉沦 ${G.descent}/${threshold}`;
    } else if(G.awakeningLevel>=3){
      txt += ` · 已至深渊`;
    }
    badge.textContent=txt;
    badge.classList.add('visible');
    document.body.classList.add('awakened');
  } else {
    badge.classList.remove('visible');
  }

  renderStatus('player-status-row',G.statusEffects);
  renderHand();
  document.getElementById('draw-count').textContent=G.draw.length;
  document.getElementById('discard-count').textContent=G.discard.length;
}

function getCardDisplayData(cardId) {
  const card = ALL_CARDS[cardId];
  if(!card) return null;
  const awLvl = G.awakeningLevel;
  return {
    ...card,
    displayDesc: awLvl>0 && card.awDesc ? card.awDesc[awLvl-1] : card.desc,
    isAwakened: awLvl > 0 && card.type !== 'curse',
    displaySanCost: awLvl === 0 ? card.sanCost : 0,
    // Forbidden cards show HP cost when awakened
    displayHpCost: (awLvl>0 && card.type==='forbidden') ? [null,5,3,0][awLvl] : 0,
  };
}

function renderHand(){
  const el=document.getElementById('hand-cards');
  el.innerHTML='';
  G.hand.forEach((cardId,idx)=>{
    const card=ALL_CARDS[cardId];
    if(!card) return;
    const disp=getCardDisplayData(cardId);
    const cost = effectiveCost(card, idx);
    const discounted = cost < card.cost;
    const canPlay=G.energy>=cost && card.type!=='curse';
    const div=document.createElement('div');

    let cls='card type-'+card.type+(canPlay?'':' unplayable');
    if(disp.isAwakened) cls+=' awakened-card';
    div.className=cls;

    const costDisplay = cost;
    div.innerHTML=`
      <div class="card-cost"${discounted?' style="background:var(--san-dim);border-color:var(--san-color);color:var(--san-color)"':''}>${costDisplay}</div>
      <div class="card-icon">${card.icon}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${disp.displayDesc}</div>
      ${disp.displaySanCost>0?`<div class="card-san-cost">-${disp.displaySanCost} 理智</div>`:''}
      ${disp.isAwakened?`<div class="aw-tag">觉醒 Lv.${G.awakeningLevel}</div>`:''}
    `;
    if(canPlay) div.onclick=()=>playCard(idx);
    el.appendChild(div);
  });
}

function renderEnemies(){
  const container=document.getElementById('enemies-container');
  if(!container) return;
  container.innerHTML='';
  const icons={attack:'⚔',shield:'🛡',debuff:'☠'};
  const target=getTarget();
  const multi=livingEnemies().length>1;

  G.enemies.forEach((e,idx)=>{
    const card=document.createElement('div');
    const dead=e.hp<=0;
    const isTarget=target && e.uid===target.uid && !dead;
    card.className='enemy-card'+(dead?' dead':'')+(isTarget?' selected':'')+(!dead&&multi?' targetable':'');

    const action=e.actions[e.actionIndex%e.actions.length];
    const intentText = dead ? '已消灭' : '意图: '+action.label+' '+(icons[action.type]||'')+' '+(action.val||'');

    // status badges html
    const statusNames={weak:'弱化',burn:'灼烧',strength:'力量'};
    const statusHtml = e.status.map(s=>
      `<span class="status-badge status-${s.type}">${statusNames[s.type]||s.type} ${s.stacks}</span>`
    ).join('');

    card.innerHTML=`
      ${isTarget&&multi?'<div class="target-marker">▼</div>':''}
      <p class="enemy-name">${e.name}</p>
      <div class="enemy-sprite">${e.sprite}</div>
      <div class="enemy-bars">
        <div class="stat-bar-wrap"><div class="stat-bar-fill hp-fill" style="width:${Math.max(0,e.hp/e.maxHp*100)}%"></div></div>
        <span class="stat-value">${e.hp}/${e.maxHp}</span>
        ${e.shield>0?`<span class="enemy-shield-tag">🛡 ${e.shield}</span>`:''}
        <div class="status-row">${statusHtml}</div>
      </div>
      <div class="enemy-intent">${intentText}</div>
    `;
    if(!dead) card.onclick=()=>selectTarget(idx);
    container.appendChild(card);
  });
}

function renderStatus(elId, effects){
  const el=document.getElementById(elId);
  if(!el) return;
  el.innerHTML='';
  effects.forEach(s=>{
    const b=document.createElement('span');
    b.className='status-badge status-'+s.type;
    const names={weak:'弱化',burn:'灼烧',strength:'力量',shield:'护盾',mad:'妄想',fusion:'融合'};
    b.textContent=(names[s.type]||s.type)+' '+s.stacks;
    el.appendChild(b);
  });
}

// Compute the actual energy cost of a card, factoring Clarity first-card discount
function effectiveCost(card, handIdx){
  if(G._nextCardFree && handIdx===0) return 0;
  let cost=card.cost;
  // Clarity II+: first card played each turn costs 1 less (min 0), only while sane
  if(!G.awakened && G._firstCardThisTurn && clarityTier(G)>=2 && cost>0){
    cost=Math.max(0,cost-1);
  }
  return cost;
}

function playCard(handIdx){
  const cardId=G.hand[handIdx];
  const card=ALL_CARDS[cardId];
  if(!card||card.type==='curse') return;
  const isFree=G._nextCardFree && handIdx===0;
  const cost=effectiveCost(card, handIdx);
  if(G.energy<cost) return;
  if(isFree) G._nextCardFree=false;
  // Consume the first-card discount
  if(!G.awakened && G._firstCardThisTurn && clarityTier(G)>=2){ G._firstCardThisTurn=false; }
  G.energy-=cost;
  G.hand.splice(handIdx,1);
  G.discard.push(cardId);
  addLog('使用：'+card.name+(G.awakened?' [觉醒]':''),'special');
  sfxForCard(card);
  card.play(G);
  checkDeath();
  // Remove newly-dead enemies' lingering state, check win
  if(livingEnemies().length===0){ enemiesDefeated(); return; }
  updateBattleUI();
}

// dealDamage now hits the selected target (or a specified enemy)
function dealDamage(g, base, targetEnemy){
  const enemy = targetEnemy || getTarget();
  if(!enemy || enemy.hp<=0) return;
  let dmg=base;
  const strEff=g.statusEffects.find(s=>s.type==='strength');
  if(strEff) dmg+=strEff.stacks;
  const fusionEff=g.statusEffects.find(s=>s.type==='fusion');
  if(fusionEff) dmg+=fusionEff.stacks;
  const weakEff=enemy.status.find(s=>s.type==='weak');
  if(weakEff) dmg=Math.floor(dmg*1.3);
  // Character passive: seer's awakened damage bonus
  if(g.awakened && g.character?.passive?.awakenedDmgBonus){
    dmg=Math.floor(dmg*(1+g.character.passive.awakenedDmgBonus));
  }
  let remaining=dmg;
  if(enemy.shield>0){
    const abs=Math.min(enemy.shield,remaining);
    enemy.shield-=abs; remaining-=abs;
    if(abs>0) addLog('穿透「'+enemy.name+'」护盾 '+abs,'shield');
  }
  if(remaining>0) enemy.hp=Math.max(0,enemy.hp-remaining);
  addLog('对「'+enemy.name+'」造成 '+dmg+' 点伤害','damage');
}

// Deal damage to ALL living enemies (for AoE cards)
function dealDamageAll(g, base){
  livingEnemies().forEach(e=>dealDamage(g, base, e));
}

function gainShield(g,amt){ g.shield+=amt; addLog('获得 '+amt+' 点护盾','shield'); }
function gainSan(g,amt){ g.san=Math.min(g.maxSan,g.san+amt); addLog('恢复 '+amt+' 点理智','san'); }

// 沉沦阈值：当前觉醒等级 -> 冲击下一级所需的沉沦值
const DESCENT_THRESHOLDS = { 1: 30, 2: 50 }; // Lv1→2 需30, Lv2→3 需50

function loseSan(g,amt){
  // Character passive: sanity loss reduction (applies to both SAN drain and descent)
  const mult = g.character?.passive?.sanLossMult || 1;
  amt = Math.round(amt * mult);

  if(g.awakened){
    // SAN已归零：理智的"消耗"转化为沉沦，推进更深的觉醒
    addDescent(g, amt);
    return;
  }

  g.san=Math.max(0,g.san-amt);
  addLog('失去 '+amt+' 点理智','san');
  checkAwakening();
}

// 累积沉沦值；攒满阈值则跳到下一觉醒等级
function addDescent(g, amt){
  if(g.awakeningLevel >= 3){
    // 已达最深，无法再沉沦
    return;
  }
  g.descent += amt;
  addLog('🕳 你向深渊更近一步（沉沦 +'+amt+'）','awakened');
  const threshold = DESCENT_THRESHOLDS[g.awakeningLevel];
  if(threshold && g.descent >= threshold){
    g.descent -= threshold;
    g.awakeningLevel++;
    showAwakeningPopup(g.awakeningLevel);
  }
}

function healPlayer(g,amt){ g.hp=Math.min(g.maxHp,g.hp+amt); addLog('恢复 '+amt+' 点生命','heal'); }

function gainStrength(g,amt){
  let s=g.statusEffects.find(e=>e.type==='strength');
  if(s) s.stacks+=amt; else g.statusEffects.push({type:'strength',stacks:amt});
  addLog('获得 '+amt+' 点力量','special');
}

// addEnemyStatus applies to the selected target (or specified enemy)
function addEnemyStatus(g,type,stacks,targetEnemy){
  const enemy = targetEnemy || getTarget();
  if(!enemy || enemy.hp<=0) return;
  let s=enemy.status.find(e=>e.type===type);
  if(s) s.stacks+=stacks; else enemy.status.push({type,stacks});
  const names={weak:'弱化',burn:'灼烧',strength:'力量'};
  addLog('「'+enemy.name+'」获得「'+(names[type]||type)+'」×'+stacks,'special');
}

function drawCards(g,n){
  for(let i=0;i<n;i++){
    if(g.draw.length===0){
      if(g.discard.length===0) break;
      g.draw=shuffle([...g.discard]); g.discard=[];
    }
    if(g.draw.length>0){
      const c=g.draw.pop();
      g.hand.push(c);
      if(ALL_CARDS[c]?.type==='curse'){ g.hp=Math.max(1,g.hp-5); addLog('☠ 诅咒卡在手中灼烧！-5HP','damage'); }
    }
  }
}

function endTurn(){
  // Each living enemy takes its action in turn
  livingEnemies().forEach(enemy=>{
    if(enemy.hp<=0) return; // could have died from a previous enemy? no, but safe
    const action=enemy.actions[enemy.actionIndex%enemy.actions.length];
    enemy.actionIndex++;

    if(action.type==='attack'){
      let dmg=action.val;
      const weakEff=enemy.status.find(s=>s.type==='weak');
      if(weakEff){ dmg=Math.floor(dmg*0.7); weakEff.stacks--; if(weakEff.stacks<=0) enemy.status.splice(enemy.status.indexOf(weakEff),1); }
      if(G.shield>0){ const abs=Math.min(G.shield,dmg); G.shield-=abs; dmg-=abs; if(abs>0) addLog('护盾吸收 '+abs+' 点伤害','shield'); }
      if(dmg>0){ G.hp=Math.max(0,G.hp-dmg); addLog('「'+enemy.name+'」攻击！你受到 '+dmg+' 点伤害','damage'); }
    } else if(action.type==='shield'){
      enemy.shield+=action.val; addLog('「'+enemy.name+'」获得 '+action.val+' 点护盾','shield');
    } else if(action.type==='debuff'){
      G.discard.push('corruption');
      addLog('☠ 「'+enemy.name+'」将诅咒注入你的牌组！','damage');
      if(!G.awakened) loseSan(G,10);
      else { G.hp=Math.max(1,G.hp-5); addLog('觉醒者仍受诅咒灼烧：-5HP','damage'); }
    }
    if(G.hp<=0){ checkDeath(); }
  });

  if(G.hp<=0){ checkDeath(); return; }

  // Burn ticks on every enemy
  livingEnemies().forEach(enemy=>{
    const burn=enemy.status.find(s=>s.type==='burn');
    if(burn){ const bd=burn.stacks*3; enemy.hp=Math.max(0,enemy.hp-bd); addLog('灼烧！「'+enemy.name+'」损失 '+bd+' HP','damage'); burn.stacks--; if(burn.stacks<=0) enemy.status.splice(enemy.status.indexOf(burn),1); }
  });

  // New turn
  G.shield=0;
  G.hand.forEach(c=>G.discard.push(c));
  G.hand=[]; G.energy=G.maxEnergy; G._nextCardFree=false;
  G._firstCardThisTurn=true;

  // ===== CLARITY SUSTAIN (the reward for staying sane) =====
  if(!G.awakened){
    const tier=clarityTier(G);
    const heal=[0,0,2,3][tier]; // 清明II +2/回合, 清明III +3/回合
    if(heal>0 && G.hp<G.maxHp){
      G.hp=Math.min(G.maxHp,G.hp+heal);
      addLog(`✦ 清明的心神抚平伤痛：+${heal} HP`,'san');
    }
  }

  // ===== AWAKENING COSTS (the price of power) =====
  if(G.awakened){
    const lvl=G.awakeningLevel;
    // (A) Bleed: lose HP every turn, scaling with level
    const bleed=[0,2,4,6][lvl];
    if(bleed>0){
      G.hp=Math.max(0,G.hp-bleed);
      addLog(`🩸 觉醒灼烧着你的血肉：-${bleed} HP`,'damage');
    }
  }

  // Fusion residual: small strength trickle at L3 (kept, but reduced)
  if(G.awakeningLevel>=3 && Math.random()<0.5){ gainStrength(G,1); }

  // Clarity bonus draw (staying sane rewards card flow)
  let drawN = 5;
  if(clarityTier(G)>=3) drawN += 1;
  drawCards(G,drawN);

  // (B) Chaos: awakened mind may discard a random card after drawing
  if(G.awakened){
    const lvl=G.awakeningLevel;
    const chaosChance=[0,0.15,0.25,0.35][lvl];
    if(Math.random()<chaosChance && G.hand.length>0){
      const idx=Math.floor(Math.random()*G.hand.length);
      const lost=G.hand.splice(idx,1)[0];
      G.discard.push(lost);
      addLog(`🌀 失控！疯狂让你弃掉了「${ALL_CARDS[lost]?.name||lost}」`,'awakened');
    }
  }

  checkDeath();
  if(G.hp<=0) return;
  if(livingEnemies().length===0){ enemiesDefeated(); return; }
  updateBattleUI();
}

function enemiesDefeated(){
  addLog('✓ 所有敌人已被击败！','special');
  updateBattleUI();
  // Boss check — was the starspawn among them?
  const hadBoss = G.enemies.some(e=>e.id==='starspawn');
  if(hadBoss){
    const winText = G.awakened
      ? `你以「${AWAKENING_DATA[G.awakeningLevel].name}」之姿击败了克苏鲁星裔。你究竟还是人类吗？`
      : '你以理智之力击败了克苏鲁星裔。也许人类并非如此渺小。';
    document.getElementById('win-text').textContent=winText;
    if(window.Audio2){ Audio2.play('victory'); Audio2.stopBgm(); }
    if(window.SaveSystem) SaveSystem.clear(); // 通关后清除存档
    setTimeout(()=>showScreen('win-screen'),1000);
    return;
  }
  checkAwakeningEscalation();
  healPlayer(G,8);
  setTimeout(()=>showReward(),600);
}

function checkDeath(){
  if(G.hp<=0){
    const wasAwakened=G.awakened;
    if(window.Audio2){ Audio2.play('defeat'); Audio2.stopBgm(); }
    if(window.SaveSystem) SaveSystem.clear(); // 死亡后清除存档，不可续关
    showScreen('gameover-screen');
    document.getElementById('end-icon').textContent=wasAwakened?'🌀':'💀';
    document.getElementById('end-title-text').textContent=wasAwakened?'意识消散':'肉体消亡';
    document.getElementById('end-title-text').className='end-title '+(wasAwakened?'madness':'death');
    document.getElementById('end-text').textContent=wasAwakened
      ?'即便是觉醒的意识也无法承受这一切。你在深渊中彻底消散，成为古神梦境中一粒微尘。'
      :'你倒在了黑暗之中。古神们漠然地转过身去，寻找下一个猎物。';
  }
}

// ===========================================
// REWARD
// ===========================================
function showReward(){
  G.currentPhase='reward';
  // Blend character-specific pool with general pool, weighted toward character cards
  const charPool = G.character?.rewardPool || [];
  const combined = [...charPool, ...charPool, ...REWARD_POOL]; // char cards appear twice as often
  const seen=new Set();
  const pool=combined.filter(c=>{
    if(seen.has(c)) return Math.random()<0.3; // allow occasional dupes
    seen.add(c);
    return !G.deck.includes(c) || Math.random()<0.3;
  });
  shuffle(pool);
  // dedupe for display
  const picks=[]; const used=new Set();
  for(const c of pool){ if(!used.has(c)){ used.add(c); picks.push(c); } if(picks.length>=3) break; }
  document.getElementById('reward-subtitle').textContent='选择一张卡牌加入你的牌组';
  const container=document.getElementById('reward-cards');
  container.innerHTML='';
  picks.forEach(cardId=>{
    const card=ALL_CARDS[cardId];
    if(!card) return;
    const disp=getCardDisplayData(cardId);
    const wrap=document.createElement('div');
    wrap.className='reward-card-wrap';
    const cardEl=document.createElement('div');
    let cls='card type-'+card.type;
    if(disp.isAwakened) cls+=' awakened-card';
    cardEl.className=cls;
    cardEl.innerHTML=`
      <div class="card-cost">${card.cost}</div>
      <div class="card-icon">${card.icon}</div>
      <div class="card-name">${card.name}</div>
      <div class="card-desc">${disp.displayDesc}</div>
      ${disp.displaySanCost>0?`<div class="card-san-cost">-${disp.displaySanCost} 理智</div>`:''}
      ${disp.isAwakened?`<div class="aw-tag">觉醒 Lv.${G.awakeningLevel}</div>`:''}
    `;
    const btn=document.createElement('button');
    btn.className='btn';
    btn.textContent='选择此卡';
    btn.onclick=()=>{ addCard(G,cardId); returnToMap(); };
    wrap.appendChild(cardEl);
    wrap.appendChild(btn);
    container.appendChild(wrap);
  });
  showScreen('reward-screen');
}

function skipReward(){ returnToMap(); }

function addCard(g,cardId){ g.deck.push(cardId); addLog('获得卡牌：'+ALL_CARDS[cardId]?.name,'special'); }
function addRandomCard(g){ const pool=REWARD_POOL.filter(c=>ALL_CARDS[c]?.type!=='forbidden'); addCard(g,pool[Math.floor(Math.random()*pool.length)]); }
function addRandomForbiddenCard(g){ const pool=REWARD_POOL.filter(c=>ALL_CARDS[c]?.type==='forbidden'); addCard(g,pool[Math.floor(Math.random()*pool.length)]); }

function returnToMap(){
  G.floor++;
  if(G.floor>G.maxFloor){
    if(window.SaveSystem) SaveSystem.save(G,{finished:true});
    if(window.Audio2) Audio2.play('victory');
    showScreen('win-screen'); return;
  }
  G.currentPhase='map';
  if(window.SaveSystem) SaveSystem.save(G,{phase:'map'}); // 每回到地图自动存档
  if(window.Audio2) Audio2.playBgm(G.awakened?'awaken':'map');
  showScreen('map-screen');
  renderMap();
}

// ===========================================
// EVENT
// ===========================================
function startEvent(){
  const ev=EVENTS[Math.floor(Math.random()*EVENTS.length)];
  document.getElementById('event-icon').textContent=ev.icon;
  document.getElementById('event-title').textContent=ev.title;
  document.getElementById('event-text').textContent=ev.text;
  const choicesEl=document.getElementById('event-choices');
  choicesEl.innerHTML='';
  ev.choices.forEach(c=>{
    const btn=document.createElement('button');
    btn.className='event-choice';
    btn.innerHTML=`<span>${c.text}</span><span class="choice-cost">${c.cost}</span>`;
    btn.onclick=()=>{ if(window.Audio2) Audio2.play('select'); c.action(G); updateMapStats(); returnToMap(); };
    choicesEl.appendChild(btn);
  });
  showScreen('event-screen');
}

// ===========================================
// HELPERS
// ===========================================
function addLog(msg,type){
  const log=document.getElementById('battle-log');
  if(!log) return;
  const el=document.createElement('div');
  el.className='log-entry '+(type||'');
  el.textContent=msg;
  log.appendChild(el);
  log.scrollTop=log.scrollHeight;
  while(log.children.length>25) log.removeChild(log.firstChild);
}

// 玩家出牌时触发的音效（在 playCard 调用，避免日志噪声）
function sfxForCard(card){
  if(!window.Audio2) return;
  if(card.type==='attack'||card.type==='forbidden') Audio2.play('attack');
  else if(card.type==='rational') Audio2.play('shield');
  else Audio2.play('card');
}

function setPct(id,val,max){
  const el=document.getElementById(id);
  if(el) el.style.width=(Math.max(0,val/max)*100)+'%';
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
  return arr;
}

function updateMapStats(){
  setPct('map-hp-bar',G.hp,G.maxHp);
  document.getElementById('map-hp-val').textContent=G.hp+'/'+G.maxHp;
  setPct('map-san-bar',G.san,G.maxSan);
  document.getElementById('map-san-val').textContent=G.san+'/'+G.maxSan;
  document.getElementById('deck-count').textContent=G.deck.length;
  const mapSanBar=document.getElementById('map-san-bar');
  if(mapSanBar){
    mapSanBar.className='stat-bar-fill san-fill';
    if(G.san===0) mapSanBar.classList.add('zero');
    else if(G.san/G.maxSan<0.35) mapSanBar.classList.add('low');
  }
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showDeck(){
  const names=G.deck.map(id=>ALL_CARDS[id]?.name||id).sort().join('\n');
  const charLine = G.character ? `${G.character.icon} ${G.character.name} — ${G.character.passiveName}\n${G.character.passiveDesc}\n\n` : '';
  alert(`${charLine}你的牌组 (${G.deck.length}张):\n${names}\n\n${G.awakened?'👁 觉醒状态：所有禁忌卡已变异':'理智状态：正常'}`);
}

