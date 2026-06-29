/* 深渊之塔 — 模块化拆分。所有模块共享全局函数与 G 状态，按 index.html 中的顺序加载。 */
/* === data.js: 游戏数据与卡牌定义 === */
// ===========================================
// AWAKENING SYSTEM DESIGN
// ===========================================
// SAN > 50%: Normal state. Forbidden cards cost SAN. 
// SAN 1-50%: Weakened mind. Forbidden cards cost more SAN but hit harder.
// SAN = 0, Level 1 (妄想 Delusion):
//   - Forbidden cards no longer cost SAN
//   - Instead cost 5 HP
//   - Damage +30%, Shield cards also gain power
//   - Visual: purple tint on cards
// SAN = 0 + 3 battles, Level 2 (共鸣 Resonance):
//   - Forbidden cards cost 0 HP
//   - Damage +60%, extra effects unlock
//   - Rational cards mutate into hybrid cards
// SAN = 0 + 5 battles, Level 3 (融合 Fusion):
//   - All cards become eldritch, massive power
//   - HP costs become 0, cards cost 1 less energy
//   - Special game-altering effects

let G = {};
let pendingAwakeningPopup = false;

function initState(charId) {
  const char = CHARACTERS[charId] || CHARACTERS.investigator;
  G = {
    charId: char.id,
    character: char,
    floor: 1, maxFloor: 9,
    hp: char.maxHp, maxHp: char.maxHp,
    san: char.maxSan, maxSan: char.maxSan,
    energy: 3, maxEnergy: 3,
    shield: 0, strength: 0,
    statusEffects: [],
    deck: [...char.deck],
    draw: [], discard: [], hand: [],
    enemies: [], targetIndex: 0,
    awakened: false,
    awakeningLevel: 0,       // 0=normal, 1=delusion, 2=resonance, 3=fusion
    descent: 0,              // 沉沦值：SAN归零后，继续献祭理智累积此值
    // 沉沦阈值：攒满后跳到下一觉醒等级。越深越难。
    // index by current awakeningLevel: Lv1需30冲Lv2, Lv2需50冲Lv3
    currentPhase: 'map',
    mapNodes: [],
  };
  // Apply permanent passive: veteran innate strength
  if(char.passive.strengthBonus){
    G.statusEffects.push({type:'strength', stacks:char.passive.strengthBonus});
  }
  shuffle(G.deck);
}

// ===========================================
// CARD DEFINITIONS — each has normal + awakened variants
// ===========================================
const ALL_CARDS = {
  // ---- ATTACK CARDS ----
  strike: {
    id:'strike', name:'打击', icon:'⚔', type:'attack', cost:1, sanCost:0,
    desc:'造成 6 点伤害',
    awDesc: ['造成 8 点伤害', '造成 9 点伤害，弱化敌人', '造成 11 点伤害，弱化+灼烧'],
    play(g){ dealDamage(g, 6 + awBonus(g, 2, 3, 5)); if(g.awakeningLevel>=2) addEnemyStatus(g,'weak',1); if(g.awakeningLevel>=3){ addEnemyStatus(g,'burn',1); } },
  },
  heavy_blow: {
    id:'heavy_blow', name:'重击', icon:'🔨', type:'attack', cost:2, sanCost:0,
    desc:'造成 14 点伤害',
    awDesc: ['造成 17 点伤害', '造成 20 点伤害', '造成 24 点伤害'],
    play(g){ dealDamage(g, 14 + awBonus(g, 3, 6, 10)); },
  },
  quick_strike: {
    id:'quick_strike', name:'连刺', icon:'🗡', type:'attack', cost:1, sanCost:0,
    desc:'造成 3×2 点伤害',
    awDesc: ['造成 4×2 点伤害', '造成 4×3 点伤害', '造成 5×3 点伤害'],
    play(g){
      const hits = g.awakeningLevel>=2 ? 3 : 2;
      const dmg = g.awakeningLevel>=3 ? 5 : g.awakeningLevel>=1 ? 4 : 3;
      for(let i=0;i<hits;i++) dealDamage(g, dmg);
    },
  },

  // ---- RATIONAL / DEFENSE CARDS ----
  ward: {
    id:'ward', name:'结界', icon:'🛡', type:'rational', cost:1, sanCost:0,
    desc:'获得 8 点护盾',
    awDesc: ['获得 10 点护盾', '获得 10 护盾，造成 4 伤害', '获得 12 护盾，造成 6 伤害'],
    play(g){
      gainShield(g, 8 + awBonus(g, 2, 2, 4));
      if(g.awakeningLevel>=2) dealDamage(g, g.awakeningLevel>=3 ? 6 : 4);
    },
  },
  meditation: {
    id:'meditation', name:'冥想', icon:'🧘', type:'rational', cost:1, sanCost:0,
    desc:'恢复 12 点理智',
    awDesc: ['无法恢复理智，改为+4HP+6护盾', '无法恢复理智，改为+7HP+8护盾', '无法恢复理智，改为+10HP+10护盾'],
    play(g){
      if(g.awakeningLevel===0){
        gainSan(g, 12);
      } else {
        // Awakened: can't recover SAN, mind is gone. Body hardens instead.
        const hp = [4,7,10][g.awakeningLevel-1];
        const sh = [6,8,10][g.awakeningLevel-1];
        healPlayer(g, hp);
        gainShield(g, sh);
        addLog('理智已逝，肉体开始异化强化', 'awakened');
      }
    },
  },
  fortify: {
    id:'fortify', name:'强化防御', icon:'🔰', type:'rational', cost:2, sanCost:0,
    desc:'获得 18 点护盾',
    awDesc: ['获得 21 点护盾', '获得 22 护盾，恢复 5HP', '获得 24 护盾，恢复 8HP'],
    play(g){
      gainShield(g, 18 + awBonus(g, 3, 4, 6));
      if(g.awakeningLevel>=2) healPlayer(g, g.awakeningLevel>=3 ? 8 : 5);
    },
  },
  swift_mind: {
    id:'swift_mind', name:'清醒之念', icon:'💡', type:'rational', cost:0, sanCost:0,
    desc:'抽 2 张牌，恢复 5 理智',
    awDesc: ['抽 2 张牌，获得 4 护盾', '抽 3 张牌，获得 5 护盾', '抽 3 张牌，获得 7 护盾'],
    play(g){
      if(g.awakeningLevel===0){
        drawCards(g, 2); gainSan(g, 5);
      } else {
        const draws = g.awakeningLevel>=2 ? 3 : 2;
        const sh = [4,5,7][g.awakeningLevel-1];
        drawCards(g, draws); gainShield(g, sh);
        addLog('混沌的思维涌现出战术', 'awakened');
      }
    },
  },

  // ---- FORBIDDEN CARDS — SAN cost before awakening, HP cost or free after ----
  abyss_gaze: {
    id:'abyss_gaze', name:'深渊凝视', icon:'👁', type:'forbidden', cost:1, sanCost:20,
    desc:'造成 20 点伤害，-20理智',
    awDesc: ['造成 24 点伤害，-5HP', '造成 28 点伤害，-4HP', '造成 33 点伤害，-3HP'],
    play(g){ forbiddenPlay(g, [20,24,28,33], [20,5,4,3], ()=>{}); },
  },
  soul_drain: {
    id:'soul_drain', name:'灵魂榨取', icon:'🌀', type:'forbidden', cost:2, sanCost:15,
    desc:'造成18伤，回复等量HP，-15理智',
    awDesc: ['造成22伤，回复22HP，-5HP', '造成26伤，回复26HP，-4HP', '造成30伤，回复30HP，-3HP'],
    play(g){
      const dmgs = [18,22,26,30];
      const costs = [15,5,4,3];
      const dmg = forbiddenDmgCost(g, dmgs, costs);
      dealDamage(g, dmg);
      healPlayer(g, dmg);
    },
  },
  eldritch_bolt: {
    id:'eldritch_bolt', name:'星际闪电', icon:'⚡', type:'forbidden', cost:1, sanCost:10,
    desc:'造成10伤，弱化敌人，-10理智',
    awDesc: ['造成13伤，弱化2层，-4HP', '造成16伤，弱化2层，-3HP', '造成20伤，弱化3+灼烧2，-2HP'],
    play(g){
      const dmgs = [10,13,16,20];
      const costs = [10,4,3,2];
      forbiddenDmgCost(g, dmgs, costs);
      const dmg = dmgs[g.awakeningLevel];
      dealDamage(g, dmg);
      const weakStacks = g.awakeningLevel>=3 ? 3 : g.awakeningLevel>=1 ? 2 : 1;
      addEnemyStatus(g,'weak', weakStacks);
      if(g.awakeningLevel>=3) addEnemyStatus(g,'burn', 2);
    },
  },
  void_whisper: {
    id:'void_whisper', name:'虚空低语', icon:'👂', type:'forbidden', cost:0, sanCost:15,
    desc:'抽 3 张牌，-15理智',
    awDesc: ['抽 3 张牌，-5HP', '抽 3 张牌，-4HP', '抽 4 张牌，-3HP'],
    play(g){
      const costs = [15,5,4,3];
      forbiddenCostOnly(g, costs);
      const draws = g.awakeningLevel>=3 ? 4 : 3;
      drawCards(g, draws);
    },
  },
  tentacle_grasp: {
    id:'tentacle_grasp', name:'触手缠绕', icon:'🐙', type:'forbidden', cost:2, sanCost:10,
    desc:'造成12伤，使敌人灼烧2层，-10理智',
    awDesc: ['造成15伤，灼烧3层，-4HP', '造成18伤，灼烧3层，弱化2，-3HP', '造成22伤，灼烧4层，弱化2，-2HP'],
    play(g){
      const dmgs = [12,15,18,22];
      const costs = [10,4,3,2];
      forbiddenDmgCost(g, dmgs, costs);
      dealDamage(g, dmgs[g.awakeningLevel]);
      const burnStacks = g.awakeningLevel>=3 ? 4 : g.awakeningLevel>=1 ? 3 : 2;
      addEnemyStatus(g,'burn', burnStacks);
      if(g.awakeningLevel>=2) addEnemyStatus(g,'weak', 2);
    },
  },
  ancient_knowledge: {
    id:'ancient_knowledge', name:'太古知识', icon:'📜', type:'forbidden', cost:1, sanCost:20,
    desc:'获得 2 点力量，-20理智',
    awDesc: ['获得 2 点力量，-6HP', '获得 3 点力量，-5HP，抽1张', '获得 3 点力量，-4HP，抽1张'],
    play(g){
      const strAmts = [2,2,3,3];
      const costs = [20,6,5,4];
      forbiddenCostOnly(g, costs);
      gainStrength(g, strAmts[g.awakeningLevel]);
      if(g.awakeningLevel>=2) drawCards(g, 1);
    },
  },

  // ---- VETERAN SIGNATURE CARDS ----
  bash: {
    id:'bash', name:'盾击', icon:'🛡', type:'attack', cost:1, sanCost:0,
    desc:'造成 8 伤害，获得 6 护盾',
    awDesc: ['造成 12 伤害，获得 9 护盾', '造成 16 伤害，获得 12 护盾', '造成 22 伤害，获得 16 护盾'],
    play(g){ dealDamage(g, 8+awBonus(g,4,8,14)); gainShield(g, 6+awBonus(g,3,6,10)); },
  },
  rampage: {
    id:'rampage', name:'狂暴', icon:'💢', type:'attack', cost:1, sanCost:0,
    desc:'造成 7 伤害，获得 2 力量',
    awDesc: ['造成 11 伤害，获得 3 力量', '造成 15 伤害，获得 4 力量', '造成 20 伤害，获得 5 力量'],
    play(g){ dealDamage(g, 7+awBonus(g,4,8,13)); gainStrength(g, [2,3,4,5][g.awakeningLevel]); },
  },
  iron_will: {
    id:'iron_will', name:'钢铁意志', icon:'⛓', type:'rational', cost:1, sanCost:0,
    desc:'获得 14 护盾，恢复 6 理智',
    awDesc: ['获得 20 护盾，+5HP', '获得 24 护盾，+8HP', '获得 30 护盾，+12HP，+2力量'],
    play(g){
      if(g.awakeningLevel===0){ gainShield(g,14); gainSan(g,6); }
      else { gainShield(g,[0,20,24,30][g.awakeningLevel]); healPlayer(g,[0,5,8,12][g.awakeningLevel]); if(g.awakeningLevel>=3) gainStrength(g,2); }
    },
  },
  // ---- SEER SIGNATURE CARDS ----
  third_eye: {
    id:'third_eye', name:'第三只眼', icon:'👁', type:'forbidden', cost:1, sanCost:12,
    desc:'抽2张牌，造成8伤害，-12理智',
    awDesc: ['抽2张，造成14伤害，-4HP', '抽3张，造成20伤害，-2HP', '抽3张，造成28伤害，免费'],
    play(g){
      const dmgs=[8,14,20,28], costs=[12,4,2,0];
      forbiddenCostOnly(g, costs);
      drawCards(g, g.awakeningLevel>=2?3:2);
      dealDamage(g, dmgs[g.awakeningLevel]);
    },
  },
  madness_gift: {
    id:'madness_gift', name:'疯狂馈赠', icon:'🌑', type:'forbidden', cost:1, sanCost:0,
    desc:'消耗一半当前理智，造成等量伤害',
    awDesc: ['造成 18 固定伤害，-4HP', '造成 26 固定伤害，-2HP', '造成 36 固定伤害，免费'],
    play(g){
      if(g.awakeningLevel===0){
        const half=Math.floor(g.san/2);
        g.san-=half;
        addLog('献出一半理智：-'+half,'san');
        dealDamage(g, half);
        checkAwakening();
      } else {
        const costs=[0,4,2,0]; const dmgs=[0,18,26,36];
        if(costs[g.awakeningLevel]>0){ g.hp=Math.max(1,g.hp-costs[g.awakeningLevel]); addLog('觉醒代价：-'+costs[g.awakeningLevel]+' HP','damage'); }
        addDescent(g, 3);
        dealDamage(g, dmgs[g.awakeningLevel]);
      }
    },
  },

  // ---- CURSE ----
  corruption: {
    id:'corruption', name:'腐化', icon:'☠', type:'curse', cost:0, sanCost:0,
    desc:'无法使用。抽到时扣5HP',
    awDesc: ['无法使用。抽到时扣5HP', '无法使用。抽到时扣5HP', '无法使用。抽到时扣5HP'],
    play(g){},
  },
};

// Helper: apply forbidden card cost based on awakening level
// Returns damage value from the table
// Apply forbidden SAN cost with character multiplier (e.g. seer halves it)
function payForbiddenSan(g, baseCost){
  const mult = g.character?.passive?.forbiddenSanMult || 1;
  loseSan(g, Math.round(baseCost * mult));
}

function forbiddenDmgCost(g, dmgTable, costTable) {
  const lvl = g.awakeningLevel;
  if(lvl === 0) { payForbiddenSan(g, costTable[0]); }
  else if(costTable[lvl] > 0) {
    g.hp = Math.max(1, g.hp - costTable[lvl]);
    addLog(`觉醒代价：-${costTable[lvl]} HP`, 'damage');
    addDescent(g, 3); // 在战斗中施放禁忌卡也推进沉沦
  }
  return dmgTable[lvl];
}

function forbiddenPlay(g, dmgTable, costTable, extraFn) {
  const dmg = forbiddenDmgCost(g, dmgTable, costTable);
  dealDamage(g, dmg);
  extraFn(g);
}

function forbiddenCostOnly(g, costTable) {
  const lvl = g.awakeningLevel;
  if(lvl === 0) { payForbiddenSan(g, costTable[0]); }
  else if(costTable[lvl] > 0) {
    g.hp = Math.max(1, g.hp - costTable[lvl]);
    addLog(`觉醒代价：-${costTable[lvl]} HP`, 'damage');
    addDescent(g, 3); // 在战斗中施放禁忌卡也推进沉沦
  }
}

// Awakening damage bonus helper — kept deliberately modest so bleed/chaos costs matter
function awBonus(g, l1, l2, l3) {
  return [0,l1,l2,l3][g.awakeningLevel] || 0;
}

// ===========================================
// CLARITY (理智清明) — reward for staying sane.
// While NOT awakened, high SAN grants escalating passive benefits.
// This makes hoarding sanity a real strategy, not just "forbidden-card fuel".
// Tier by current SAN percentage:
//   >= 80%  清明III: 战斗开局 +6 护盾, 每回合首张牌 -1 费, 抽牌+1
//   >= 55%  清明II : 战斗开局 +4 护盾, 每回合首张牌 -1 费
//   >= 30%  清明I  : 战斗开局 +3 护盾
//   <  30%        : 濒临崩溃，无收益（且更易被清零）
// ===========================================
function clarityTier(g){
  if(g.awakened) return 0;
  const pct = g.san / g.maxSan;
  if(pct >= 0.80) return 3;
  if(pct >= 0.55) return 2;
  if(pct >= 0.30) return 1;
  return 0;
}
const CLARITY_INFO = {
  0:{name:'—',desc:'理智低迷，没有清明加成'},
  1:{name:'清明 I',desc:'战斗开局 +3 护盾'},
  2:{name:'清明 II',desc:'战斗开局 +4 护盾；首张牌 -1 费；每回合 +2 HP'},
  3:{name:'清明 III',desc:'战斗开局 +6 护盾；首张牌 -1 费；开局多抽 1 张；每回合 +3 HP'},
};

const STARTER_DECK = ['strike','strike','strike','strike','ward','ward','meditation','quick_strike'];
const REWARD_POOL = ['heavy_blow','abyss_gaze','soul_drain','eldritch_bolt','void_whisper','tentacle_grasp','ancient_knowledge','fortify','swift_mind'];

// ===========================================
// CHARACTERS
// ===========================================
const CHARACTERS = {
  investigator: {
    id:'investigator', name:'调查员', epithet:'the investigator', icon:'🕯',
    accent:'#c8a84b', accentDim:'#7a6530', glow:'rgba(200,168,75,0.1)',
    maxHp:85, maxSan:110,
    flavor:'一位冷静的学者，凭理性与意志在黑暗中前行。最不易被疯狂吞噬。',
    passiveName:'冷静心智',
    passiveDesc:'每场战斗开始恢复 5 理智；所有理智流失减少 20%。',
    deckHint:'起始：打击×4 · 重击×2 · 冥想×2',
    deck:['strike','strike','strike','strike','heavy_blow','heavy_blow','meditation','meditation'],
    // bonus reward cards weighted toward rational/control
    rewardPool:['fortify','swift_mind','iron_will','eldritch_bolt','heavy_blow','ancient_knowledge'],
    passive:{ sanLossMult:0.8, battleStartSan:5 },
  },
  veteran: {
    id:'veteran', name:'退伍兵', epithet:'the veteran', icon:'🗡',
    accent:'#e05555', accentDim:'#5a1a1a', glow:'rgba(224,85,85,0.1)',
    maxHp:85, maxSan:70,
    flavor:'身经百战的老兵。理智早已残破，但他的血肉坚不可摧。觉醒于他不是诅咒，而是解脱。',
    passiveName:'战创',
    passiveDesc:'生命上限更高，理智上限更低。所有「力量」效果 +1。容易觉醒。',
    deckHint:'起始：打击×4 · 盾击×1 · 狂暴×1 · 强化防御×1 · 结界×1',
    deck:['strike','strike','strike','strike','bash','rampage','fortify','ward'],
    rewardPool:['heavy_blow','bash','rampage','iron_will','fortify','tentacle_grasp'],
    passive:{ strengthBonus:1 },
  },
  seer: {
    id:'seer', name:'先知', epithet:'the seer', icon:'👁',
    accent:'#9b59b6', accentDim:'#3d1a5a', glow:'rgba(155,89,182,0.14)',
    maxHp:72, maxSan:55,
    flavor:'凝视深渊太久的人。她主动拥抱疯狂，因为只有在理智的废墟之上，才能触及真正的力量。',
    passiveName:'真知',
    passiveDesc:'起始理智极低。禁忌卡的理智消耗减半。觉醒后伤害额外 +35%。',
    deckHint:'起始：打击×3 · 深渊凝视×1 · 第三只眼×1 · 冥想×2 · 疯狂馈赠×1',
    deck:['strike','strike','strike','abyss_gaze','third_eye','meditation','meditation','madness_gift'],
    rewardPool:['abyss_gaze','soul_drain','void_whisper','third_eye','madness_gift','eldritch_bolt','ancient_knowledge'],
    passive:{ forbiddenSanMult:0.5, awakenedDmgBonus:0.35 },
  },
};

// ===========================================
// AWAKENING SYSTEM
// ===========================================
const AWAKENING_DATA = [
  null,
  {
    level: 1, name: '妄想降临', tag: '觉醒 · 第一层 · 妄想',
    eye: '👁', desc: '理智的防线已然崩塌。古老的知识成为你的武器，但深渊也开始反噬你的血肉。',
    effect: '禁忌卡不再消耗理智，改为消耗少量HP\n所有卡牌效果小幅增强\n⚠ 代价：每回合 -2HP；敌人变强；15%几率失控弃牌',
  },
  {
    level: 2, name: '共鸣深化', tag: '觉醒 · 第二层 · 共鸣',
    eye: '🌀', desc: '你听见了古神的低语。力量在增长，但你正在失去对自己的掌控。',
    effect: '卡牌效果进一步提升，防御卡攻防兼备\n⚠ 代价：每回合 -4HP；敌人更强；25%几率失控弃牌',
  },
  {
    level: 3, name: '虚空融合', tag: '觉醒 · 第三层 · 融合',
    eye: '🕳', desc: '你与深渊融为一体。巅峰的力量，与无法回头的疯狂。',
    effect: '所有卡牌达到最强形态\n⚠ 代价：每回合 -6HP；敌人最强；35%几率失控弃牌\n你在和时间赛跑',
  },
];

function checkAwakening() {
  if(G.san <= 0 && G.awakeningLevel === 0) {
    triggerAwakening(1);
  }
}

function triggerAwakening(level) {
  G.awakened = true;
  G.awakeningLevel = level;
  document.body.classList.add('awakened');
  showAwakeningPopup(level);
}

function showAwakeningPopup(level) {
  const data = AWAKENING_DATA[level];
  document.getElementById('aw-eye').textContent = data.eye;
  document.getElementById('aw-level-tag').textContent = data.tag;
  document.getElementById('aw-title').textContent = data.name;
  document.getElementById('aw-desc').textContent = data.desc;
  document.getElementById('aw-effect').textContent = data.effect;
  document.getElementById('awakening-popup').classList.add('visible');
  pendingAwakeningPopup = true;
  if (window.Audio2) Audio2.play('awaken');
}

function closeAwakeningPopup() {
  document.getElementById('awakening-popup').classList.remove('visible');
  pendingAwakeningPopup = false;
  addLog(`👁 觉醒 Lv.${G.awakeningLevel}：${AWAKENING_DATA[G.awakeningLevel].name}`, 'awakened');
  updateBattleUI();
}

// 觉醒升级现在由「沉沦值」驱动（见 addDescent），不再依赖战斗胜场。
// 此函数保留为空以兼容调用点。
function checkAwakeningEscalation() {
  /* deprecated: escalation is now driven by descent, not battle count */
}

// ===========================================
// ENEMIES
// ===========================================
const ENEMIES = [
  { id:'worm', name:'深渊蠕虫', sprite:'🐛', hp:24, actions:[{type:'attack',val:5,label:'攻击'},{type:'attack',val:5,label:'攻击'},{type:'shield',val:5,label:'防御'}]},
  { id:'rat', name:'腐尸鼠群', sprite:'🐀', hp:18, actions:[{type:'attack',val:4,label:'啃咬'},{type:'attack',val:7,label:'群袭'}]},
  { id:'cultist', name:'邪教信徒', sprite:'🧟', hp:30, actions:[{type:'attack',val:8,label:'攻击'},{type:'attack',val:5,label:'弱击'},{type:'debuff',val:0,label:'诅咒'}]},
  { id:'fungoid', name:'米·戈菌生体', sprite:'🍄', hp:26, actions:[{type:'attack',val:6,label:'孢子'},{type:'shield',val:8,label:'再生'},{type:'attack',val:9,label:'侵蚀'}]},
  { id:'shoggoth', name:'修格斯幼体', sprite:'🟣', hp:40, actions:[{type:'attack',val:10,label:'攻击'},{type:'attack',val:7,label:'攻击'},{type:'shield',val:8,label:'防御'},{type:'attack',val:12,label:'强击'}]},
  { id:'byakhee', name:'拜亚基', sprite:'🦅', hp:34, actions:[{type:'attack',val:9,label:'抓伤'},{type:'attack',val:9,label:'抓伤'},{type:'attack',val:15,label:'俯冲'}]},
  { id:'ghoul', name:'食尸鬼', sprite:'👹', hp:36, actions:[{type:'attack',val:11,label:'撕咬'},{type:'attack',val:6,label:'抓挠'},{type:'shield',val:6,label:'蜷缩'}]},
  { id:'deepone', name:'深海之子', sprite:'🐟', hp:46, actions:[{type:'attack',val:8,label:'攻击'},{type:'shield',val:10,label:'防御'},{type:'attack',val:14,label:'强袭'},{type:'debuff',val:0,label:'诅咒'}]},
  { id:'hound', name:'廷达罗斯猎犬', sprite:'🐺', hp:42, actions:[{type:'attack',val:12,label:'穿刺'},{type:'attack',val:8,label:'尖啸'},{type:'attack',val:16,label:'角隙突袭'}]},
  { id:'starspawn', name:'克苏鲁星裔', sprite:'🦑', hp:75, isBoss:true, actions:[{type:'attack',val:12,label:'触手挥击'},{type:'attack',val:10,label:'精神侵蚀'},{type:'shield',val:18,label:'形态重组'},{type:'attack',val:20,label:'深渊咆哮'}]},
];
function getBoss(){ return ENEMIES.find(e=>e.isBoss); }
function getNormalEnemies(){ return ENEMIES.filter(e=>!e.isBoss); }

// ===========================================
// EVENTS
// ===========================================
const EVENTS = [
  {
    icon:'📖', title:'禁忌古籍',
    text:'你在废墟中发现一本以人皮装订的书。翻阅它的人或许能获得力量，但代价是什么？',
    choices:[
      { text:'阅读全书（获得禁忌卡，-20理智）', cost:'-20 SAN', action(g){ loseSan(g,20); addRandomForbiddenCard(g); }},
      { text:'快速翻阅（获得普通卡，-5理智）', cost:'-5 SAN', action(g){ loseSan(g,5); addRandomCard(g); }},
      { text:'放弃，离开此地', cost:'', action(g){ }},
    ]
  },
  {
    icon:'🕯', title:'悲鸣的祭坛',
    text:'一座古老祭坛散发着令人不安的光芒。刻在其上的符文诉说着献祭的仪式。',
    choices:[
      { text:'献祭HP换取力量（-15HP，获得太古知识）', cost:'-15 HP', action(g){ g.hp=Math.max(1,g.hp-15); addCard(g,'ancient_knowledge'); }},
      { text:'以理智换取护盾（-25SAN，下场战斗+30护盾）', cost:'-25 SAN', action(g){ loseSan(g,25); g._bonusShield=(g._bonusShield||0)+30; }},
      { text:'转身离开', cost:'', action(g){}},
    ]
  },
  {
    icon:'🌊', title:'深海呼唤',
    text:'远方传来低沉的吟唱。那声音来自深海，来自黑暗之中冬眠的存在。它在呼唤你的名字。',
    choices:[
      { text:'回应呼唤（获得虚空低语，-30理智）', cost:'-30 SAN', action(g){ loseSan(g,30); addCard(g,'void_whisper'); }},
      { text:'捂住耳朵逃离（恢复10HP）', cost:'+10 HP', action(g){ healPlayer(g,10); }},
    ]
  },
  {
    icon:'💊', title:'神秘药水',
    text:'地上有一瓶散发着幽光的液体。没有标签。可能是治愈药，也可能是毒药。',
    choices:[
      { text:'饮用（随机效果）', cost:'未知', action(g){
        const r=Math.random();
        if(r<0.4){ healPlayer(g,20); }
        else if(r<0.7){ gainSan(g,20); }
        else{ g.hp=Math.max(1,g.hp-15); addLog('剧毒！你损失了15点生命。','damage'); }
      }},
      { text:'放弃', cost:'', action(g){}},
    ]
  },
  {
    icon:'🗿', title:'低语的石碑',
    text:'一块布满符文的玄武岩石碑矗立在洞穴深处。当你靠近时，符文开始在你脑海中自行翻译——它们在传授某种知识。',
    choices:[
      { text:'专注聆听（永久+10理智上限，-15当前理智）', cost:'+10 上限', action(g){ g.maxSan+=10; loseSan(g,15); addLog('你的心智边界被拓宽了。','san'); }},
      { text:'刻下符文（获得星际闪电卡）', cost:'-10 SAN', action(g){ loseSan(g,10); addCard(g,'eldritch_bolt'); }},
      { text:'毁掉石碑（永久+5HP上限）', cost:'+5 HP上限', action(g){ g.maxHp+=5; g.hp+=5; addLog('砸碎石碑让你感到一丝安宁。','heal'); }},
    ]
  },
  {
    icon:'⚰️', title:'盗墓者的遗骸',
    text:'一具早已干枯的尸体倚在墓室角落，怀里紧抱着一个布袋。布袋里有东西在微微发光。',
    choices:[
      { text:'取走布袋（获得灵魂榨取卡，惊扰亡魂-12理智）', cost:'-12 SAN', action(g){ loseSan(g,12); addCard(g,'soul_drain'); }},
      { text:'搜寻其他物品（恢复15HP）', cost:'+15 HP', action(g){ healPlayer(g,15); }},
      { text:'为他默哀后离开（+8理智）', cost:'+8 SAN', action(g){ gainSan(g,8); addLog('一丝人性的温暖回到你心中。','san'); }},
    ]
  },
  {
    icon:'🌀', title:'扭曲的镜厅',
    text:'你走进一间四壁皆镜的房间。但镜中的"你"动作并不同步——它在微笑，而你没有。它似乎想和你交换些什么。',
    choices:[
      { text:'与镜像融合（立即沉沦一级，需已觉醒）', cost:'危险', action(g){
        if(g.awakened && g.awakeningLevel<3){ g.awakeningLevel++; g.descent=0; showAwakeningPopup(g.awakeningLevel); addLog('你与镜中的自己合为一体...','awakened'); }
        else if(!g.awakened){ loseSan(g,40); addLog('镜像猛地将疯狂灌入你的脑海！','san'); }
        else { gainStrength(g,3); addLog('镜像已无更多可给予你的。','special'); }
      }},
      { text:'打碎镜子（-8HP，但获得太古知识）', cost:'-8 HP', action(g){ g.hp=Math.max(1,g.hp-8); addCard(g,'ancient_knowledge'); }},
      { text:'闭眼快速通过', cost:'', action(g){ addLog('你侥幸逃离了镜厅。','');}},
    ]
  },
  {
    icon:'🕷️', title:'献祭之池',
    text:'一池漆黑黏稠的液体散发着腥甜气味。池边的石板上刻着："以血换力，以智换命。" 池水似乎在等待。',
    choices:[
      { text:'滴入鲜血（-20HP，获得2点永久力量）', cost:'-20 HP', action(g){ g.hp=Math.max(1,g.hp-20); g._permaStrength=(g._permaStrength||0)+2; addLog('力量永久铭刻在你的血肉中。','special'); }},
      { text:'凝视池水（-25理智，下两场战斗开局抽+2牌）', cost:'-25 SAN', action(g){ loseSan(g,25); g._bonusDraw=2; addLog('深邃的知识在脑中翻涌。','san'); }},
      { text:'掩鼻离开', cost:'', action(g){}},
    ]
  },
  {
    icon:'🔮', title:'占卜者的帐篷',
    text:'一个蒙面的占卜者招手让你坐下。"我能看见你的命运，旅人。但真相往往是有代价的。"',
    choices:[
      { text:'询问前路（治疗全部HP，-15理智）', cost:'-15 SAN', action(g){ g.hp=g.maxHp; loseSan(g,15); addLog('占卜者的话语既抚慰又刺痛。','heal'); }},
      { text:'请求祝福（+15理智）', cost:'+15 SAN', action(g){ gainSan(g,15); }},
      { text:'拒绝并离开', cost:'', action(g){}},
    ]
  },
  {
    icon:'📿', title:'疯修士的馈赠',
    text:'一个眼神空洞的修士拦住你，往你手里塞了一串骨制念珠。"拿着……它会保护你，也会改变你。" 说完他便消失在阴影中。',
    choices:[
      { text:'戴上念珠（获得触手缠绕卡，-10理智）', cost:'-10 SAN', action(g){ loseSan(g,10); addCard(g,'tentacle_grasp'); }},
      { text:'丢弃念珠（什么都不发生）', cost:'', action(g){ addLog('念珠落地，化为齑粉。','');}},
    ]
  },
];

