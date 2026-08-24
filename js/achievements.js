// ==========================================================================
// js/achievements.js — 実績称号（アチーブメント）システム
//
// 実績はすべて「単発実績」（1つのidに対して unlocked/claimed が1つだけ）として管理する。
// 「〇回達成」「Lv到達」のような段階的な条件も、閾値ごとに別々のidを持つ
// 単発実績として並べており（例：ach_008/009/010は同じ統計値gimmickTriggerCountを
// 1回／20回／50回でそれぞれ見る3つの別実績）、実績一覧には常に40件が個別カードとして並ぶ。
//
// 実績の状態はsaveData.titles[id]に { unlocked, claimed, claimedAt, claimedLevel } として持つ。
// このゲームにはEP（コイン）等の報酬経済が存在しないため、claim()（受け取り操作）は
// 呼び出し元（index.html側）から一切使われていない。実際に画面に出るのは
// unlocked（達成済みか）だけで、達成済みは称号名＋フレーバー文言、未達成は
// 称号名を伏せ字（？？？？？）にした上で解放条件を表示する（index.html側
// renderAchievementListTab()参照）。
//
// 統計値の蓄積元データはsaveData.stats（{ [statKey]: 数値 }）。
// index.html本体側から以下のいずれかを呼ぶことで、カウントアップ→閾値チェック→
// （必要なら）トースト表示までを内部で行う：
//   window.Achievements.incrementStat(key)       … 加算式（ギミック発動回数など）
//   window.Achievements.setStatIfHigher(key, v)   … 最大値更新式（スコア・チェイン数など）
//   window.Achievements.markSkillSelected(id)     … スキル選択回数（スキルごとに自動でカウント）
//   window.Achievements.syncOwnedSkillCount(n)    … 所持スキル数（増えた時にindex.html側から呼ぶ）
//
// index.html本体側のグローバル関数・変数（saveData, playerProgress,
// updatePlayerStatusBar, saveSaveData）に依存しているため、
// index.html本体の<script>より後に読み込むこと。
// ==========================================================================

(function(){
  const ACHIEVEMENT_DEFS = [
    { id:'ach_001', no:'001', title:'宇宙へようこそ',       desc:'はじめて宇宙へ飛び立った。',           condition:'初プレイでリザルト画面を見る' },
    { id:'ach_002', no:'002', title:'宇宙航行士',           desc:'宇宙を駆ける準備は万全だ。',           condition:'プレイヤーレベル Lv20達成',  levelReq:20 },
    { id:'ach_003', no:'003', title:'ベテラン航行士',       desc:'数々の宇宙を乗り越えてきた。',         condition:'プレイヤーレベル Lv50達成',  levelReq:50 },
    { id:'ach_004', no:'004', title:'伝説の航行士',         desc:'その名は宇宙に刻まれた。',             condition:'プレイヤーレベル Lv100達成', levelReq:100 },
    { id:'ach_005', no:'005', title:'ハズレくじ',           desc:'運試しは、いつもうまくいくとは限らない。', condition:'バッテリーでマイナス効果を引く' },
    { id:'ach_006', no:'006', title:'起死回生',             desc:'危機的状況から見事に立て直した。',       condition:'バッテリー残量10％以下で、バッテリーを取得して回復する' },
    { id:'ach_007', no:'007', title:'尽きない探究心',       desc:'果てしない宇宙を航行し続けた。',         condition:'180秒以上生存する' },

    { id:'ach_008', no:'008', title:'装置起動',       desc:'人工天体の装置をはじめて起動した。', condition:'ギミックを1回発動する',   statKey:'gimmickTriggerCount', threshold:1 },
    { id:'ach_009', no:'009', title:'装置マスター',   desc:'宇宙の装置を自在に使いこなす。',     condition:'ギミックを20回発動する',  statKey:'gimmickTriggerCount', threshold:20 },
    { id:'ach_010', no:'010', title:'宇宙の常連',     desc:'もうすっかり宇宙暮らし。',           condition:'ギミックを50回発動する',  statKey:'gimmickTriggerCount', threshold:50 },

    { id:'ach_011', no:'011', title:'赤き星の観測者', desc:'赤く輝く恒星を観測した。',           condition:'紅磁晶核を1回出現させる',   statKey:'redMarbleSpawned', threshold:1 },
    { id:'ach_012', no:'012', title:'赤き星の研究者', desc:'赤き星を何度も観測してきた。',       condition:'紅磁晶核を100回出現させる', statKey:'redMarbleSpawned', threshold:100 },
    { id:'ach_013', no:'013', title:'赤き星の博士',   desc:'赤き星のすべてを知り尽くした。',     condition:'紅磁晶核を500回出現させる', statKey:'redMarbleSpawned', threshold:500 },

    { id:'ach_014', no:'014', title:'黄金星の観測者', desc:'黄金色に輝く星を見つけた。',         condition:'金磁晶核を1回出現させる',   statKey:'goldMarbleSpawned', threshold:1 },
    { id:'ach_015', no:'015', title:'黄金星の研究者', desc:'黄金の星を幾度となく観測した。',     condition:'金磁晶核を50回出現させる',  statKey:'goldMarbleSpawned', threshold:50 },
    { id:'ach_016', no:'016', title:'黄金星の博士',   desc:'黄金の星を知り尽くした第一人者。',   condition:'金磁晶核を200回出現させる', statKey:'goldMarbleSpawned', threshold:200 },

    { id:'ach_017', no:'017', title:'恒星爆発', desc:'星の爆発にも負けない連鎖を起こした。',       condition:'1プレイで100チェイン達成', statKey:'bestChainCount', threshold:100 },
    { id:'ach_018', no:'018', title:'銀河爆発', desc:'銀河を揺るがすほどの連鎖を起こした。',       condition:'1プレイで300チェイン達成', statKey:'bestChainCount', threshold:300 },
    { id:'ach_019', no:'019', title:'ビッグバン', desc:'宇宙誕生を思わせる究極の連鎖を達成した。', condition:'1プレイで500チェイン達成', statKey:'bestChainCount', threshold:500 },

    { id:'ach_020', no:'020', title:'手練れ',         desc:'宇宙航行の腕前が身についてきた。',             condition:'1プレイで50万スコア達成',   statKey:'bestScore', threshold:500000 },
    { id:'ach_021', no:'021', title:'熟練航行士',     desc:'宇宙航行の技術を、着実に磨き上げている。',     condition:'1プレイで100万スコア達成', statKey:'bestScore', threshold:1000000 },
    { id:'ach_022', no:'022', title:'敏腕航行士',     desc:'誰もが認める腕前を手に入れた。',               condition:'1プレイで200万スコア達成', statKey:'bestScore', threshold:2000000 },
    { id:'ach_023', no:'023', title:'一流航行士',     desc:'その航行技術は、すでに一流の域に達している。', condition:'1プレイで500万スコア達成', statKey:'bestScore', threshold:5000000 },
    { id:'ach_024', no:'024', title:'超一流航行士',   desc:'その航行技術は、もはや別格。',                 condition:'1プレイで1000万スコア達成', statKey:'bestScore', threshold:10000000 },

    { id:'ach_025', no:'025', title:'宇宙初心者', desc:'まずはここから、宇宙の旅。',           condition:'総プレイ回数10回',  statKey:'totalPlayCount', threshold:10 },
    { id:'ach_026', no:'026', title:'宇宙常連',   desc:'気づけば今日も宇宙にいる。',           condition:'総プレイ回数50回',  statKey:'totalPlayCount', threshold:50 },
    { id:'ach_027', no:'027', title:'宇宙の住人', desc:'もう宇宙が第二の故郷になった。',       condition:'総プレイ回数200回', statKey:'totalPlayCount', threshold:200 },

    { id:'ach_028', no:'028', title:'スキル収集家',   desc:'少しずつ装備が充実してきた。',           condition:'スキル所有数4個', statKey:'ownedSkillCount', threshold:4 },
    { id:'ach_029', no:'029', title:'スキルマスター', desc:'多彩なスキルを使いこなせる。',           condition:'スキル所有数7個', statKey:'ownedSkillCount', threshold:7 },
    { id:'ach_030', no:'030', title:'完全装備',       desc:'あらゆる状況に対応できる装備が揃った。', condition:'スキル所有数9個', statKey:'ownedSkillCount', threshold:9 },

    { id:'ach_031', no:'031', title:'パルスの使い手',           desc:'実験成功：一瞬の航行で、星々の間を駆け抜けた。',           condition:'スキル：パルスを20回選択した',           statKey:'skillSelectCount_blink',           threshold:20 },
    { id:'ach_032', no:'032', title:'フリーズショットの使い手', desc:'実験成功：狙いを定め、星宙玉を自在に撃ち抜いた。',         condition:'スキル：フリーズショットを20回選択した', statKey:'skillSelectCount_bubble',           threshold:20 },
    { id:'ach_033', no:'033', title:'スターウェーブの使い手',   desc:'実験成功：星宙玉の群れを、一気に薙ぎ払った。',             condition:'スキル：スターウェーブを20回選択した',   statKey:'skillSelectCount_sweep',            threshold:20 },
    { id:'ach_034', no:'034', title:'シールドの使い手',         desc:'実験成功：どんな危機にも揺るがない航行を身につけた。',     condition:'スキル：シールドを10回選択した',         statKey:'skillSelectCount_shield',           threshold:10 },
    { id:'ach_035', no:'035', title:'重力崩壊の使い手',         desc:'実験成功：星宙玉を引き寄せ、流れを自在に操った。',         condition:'スキル：重力崩壊を10回選択した',         statKey:'skillSelectCount_typhoon',          threshold:10 },
    { id:'ach_036', no:'036', title:'フリーズハンドの使い手',   desc:'実験成功：動きを止める力を、巧みに使いこなした。',         condition:'スキル：フリーズハンドを10回選択した',   statKey:'skillSelectCount_beacon',           threshold:10 },
    { id:'ach_037', no:'037', title:'ブーストの使い手',         desc:'実験成功：爆発的な加速で、宇宙を駆け抜けた。',             condition:'スキル：ブーストを10回選択した',         statKey:'skillSelectCount_dash',             threshold:10 },
    { id:'ach_038', no:'038', title:'メテオキャノンの使い手',   desc:'実験成功：巨大な一撃を放ち、星宙玉を吹き飛ばした。',       condition:'スキル：メテオキャノンを10回選択した',   statKey:'skillSelectCount_cannon',           threshold:10 },
    { id:'ach_039', no:'039', title:'エネルギー変換器の使い手', desc:'実験成功：爆発の力を、余すことなくエネルギーへ変えた。',   condition:'スキル：エネルギー変換器を10回選択した', statKey:'skillSelectCount_energyConverter',  threshold:10 },

    // ── メタ実績（他の全実績が解放済みになったら解除） ──
    { id:'ach_040', no:'040', title:'宇宙の伝説', desc:'この宇宙に、新たな伝説を刻んだ。', condition:'全実績コンプリート', metaAllComplete:true },
  ];

  // ── 状態の読み書き（saveData.titles に永続化） ──
  function getTitlesStore(){
    if (typeof saveData === 'undefined') return {};
    if (!saveData.titles || Array.isArray(saveData.titles)) saveData.titles = {};
    return saveData.titles;
  }
  function getState(id){
    const store = getTitlesStore();
    return store[id] || (store[id] = { unlocked:false, claimed:false });
  }
  function getStatsStore(){
    if (typeof saveData === 'undefined') return {};
    if (!saveData.stats || typeof saveData.stats !== 'object' || Array.isArray(saveData.stats)) saveData.stats = {};
    return saveData.stats;
  }
  function getStatValue(key){
    if (!key) return 0;
    return getStatsStore()[key] || 0;
  }
  function persist(){
    if (typeof saveSaveData === 'function') saveSaveData();
  }
  function formatClaimDate(d){
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }

  // ── 未受け取りバッジ（このゲームには受け取り操作(claim)自体が存在しないため、
  //   実質「未解放→解放」の通知漏れが無いかの保険的な機能。UI側に対応するボタンが
  //   無ければ何も表示されない） ──
  function hasUnclaimed(){
    return ACHIEVEMENT_DEFS.some(def => {
      const s = getState(def.id);
      return s.unlocked && !s.claimed;
    });
  }
  function updateBadges(){
    const unclaimed = hasUnclaimed();
    const modeCollectionBtn   = document.getElementById('mode-collection');
    const achievementsCardBtn = document.getElementById('collection-achievements');
    const achvBellBtn         = document.getElementById('achv-bell-btn');
    const collectionUnlocked = !(typeof saveData !== 'undefined' && saveData.storyFlags && !saveData.storyFlags.collectionUnlocked);
    if (modeCollectionBtn)   modeCollectionBtn.classList.toggle('has-unclaimed', unclaimed && collectionUnlocked);
    if (achievementsCardBtn) achievementsCardBtn.classList.toggle('has-unclaimed', unclaimed);
    if (achvBellBtn) achvBellBtn.classList.toggle('has-unclaimed', hasUnseenLog());
  }

  // ── ベルボタンの未確認ログ判定 ──
  function hasUnseenLog(){
    const total = getLogStore().length;
    const seen = (typeof saveData !== 'undefined' && typeof saveData.achvLogSeenCount === 'number')
      ? saveData.achvLogSeenCount : 0;
    return total > seen;
  }
  function markLogSeen(){
    if (typeof saveData === 'undefined') return;
    saveData.achvLogSeenCount = getLogStore().length;
    persist();
    updateBadges();
  }

  // ── 実績解除ポップ（画面左下からにゅっと出るトースト） ──
  function ensureToastStack(){
    let stack = document.getElementById('achievement-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'achievement-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }
  // 複数の実績がほぼ同時に解除された時に重なって見えるのを防ぐため、
  // 表示はキューに積んで一定間隔で1つずつ出す。
  const toastQueue = [];
  let toastQueueRunning = false;
  const TOAST_STAGGER_MS = 300;

  function queueToast(titleText, conditionText){
    toastQueue.push({ titleText, conditionText });
    if (!toastQueueRunning) processToastQueue();
  }
  function processToastQueue(){
    if (toastQueue.length === 0){ toastQueueRunning = false; return; }
    toastQueueRunning = true;
    const { titleText, conditionText } = toastQueue.shift();
    createToastElement(titleText, conditionText);
    setTimeout(processToastQueue, TOAST_STAGGER_MS);
  }
  function createToastElement(titleText, conditionText){
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = 'achievement-toast';
    toast.innerHTML =
      `<div class="achievement-toast-label">実績解除！</div>` +
      `<div class="achievement-toast-title">${titleText}</div>` +
      (conditionText ? `<div class="achievement-toast-condition">${conditionText}</div>` : '');
    stack.appendChild(toast);
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        toast.classList.add('show');
        if (window.SoundSE) window.SoundSE.playAchievementUnlock();
      });
    });
    setTimeout(()=>{
      toast.classList.remove('show');
      toast.classList.add('leaving');
      setTimeout(()=>{ if (toast.parentNode) toast.remove(); }, 400);
    }, 3800);
  }
  function showToast(titleText, conditionText){
    pushLog(titleText, conditionText);
    queueToast(titleText, conditionText);
  }
  // ── 実績解除ログ（ベルボタンの独立タブ用）──
  const ACHV_LOG_MAX = 50;
  function getLogStore(){
    if (typeof saveData === 'undefined') return [];
    if (!Array.isArray(saveData.achvLog)) saveData.achvLog = [];
    return saveData.achvLog;
  }
  function formatLogTime(d){
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function pushLog(titleText, conditionText){
    const log = getLogStore();
    log.push({ time: formatLogTime(new Date()), title: titleText, condition: conditionText || '' });
    if (log.length > ACHV_LOG_MAX) log.splice(0, log.length - ACHV_LOG_MAX);
    persist();
  }
  function getLog(){
    return getLogStore().slice().reverse();
  }
  function refreshCollectionUI(){
    if (window.CollectionUI && typeof window.CollectionUI.refreshAchievements === 'function') {
      window.CollectionUI.refreshAchievements();
    }
  }

  // ── 単発実績の解除処理（同じidを何度呼んでも、実際に解除されるのは最初の1回だけ） ──
  function unlock(id){
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (!def) return;
    const state = getState(id);
    if (state.unlocked) return;
    state.unlocked = true;
    persist();
    showToast(def.title, def.condition);
    updateBadges();
    refreshCollectionUI();
    checkMetaAchievement(); // 今回の解除で「全実績コンプリート」の条件を満たすことがあるため毎回チェック
  }

  // ── 統計値ベースの実績チェック：該当statKeyを持つ全defのうち、閾値に達したものを解除する ──
  function checkStatAchievements(statKey){
    if (!statKey) return;
    const value = getStatValue(statKey);
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.statKey === statKey && typeof def.threshold === 'number' && value >= def.threshold) {
        unlock(def.id);
      }
    }
  }

  // ── 統計値の更新 ──
  function incrementStat(key, amount = 1){
    if (!key) return;
    const stats = getStatsStore();
    stats[key] = (stats[key] || 0) + amount;
    persist();
    checkStatAchievements(key);
  }
  function setStatIfHigher(key, value){
    if (!key) return;
    const stats = getStatsStore();
    if (!(stats[key] > value)) {
      stats[key] = value;
      persist();
      checkStatAchievements(key);
    }
  }
  // スキルを実際に選んでゲームを開始した回数（スキルごとに個別カウント）。
  // 「〇〇の使い手」実績（ach_031〜039）の判定に使う。
  function markSkillSelected(skillId){
    if (!skillId) return;
    incrementStat('skillSelectCount_' + skillId);
  }
  // 旧仕様互換：スキルを「使ったことがある」かどうかのSet（現行の実績一覧では直接は使わないが、
  // 将来の再利用に備えて統計自体は取り続けておく）
  function markSkillUsed(skillId){
    if (!skillId) return;
    const stats = getStatsStore();
    if (!Array.isArray(stats.usedSkillIds)) stats.usedSkillIds = [];
    if (!stats.usedSkillIds.includes(skillId)) {
      stats.usedSkillIds.push(skillId);
      stats.usedSkillCount = stats.usedSkillIds.length;
      persist();
    }
  }
  // 所持スキル数（saveData.unlockedSkills.length）が変化した時にindex.html側から呼ぶ。
  // 「スキル収集家／スキルマスター／完全装備」（ach_028〜030）の判定に使う。
  function syncOwnedSkillCount(count){
    if (typeof count !== 'number') return;
    setStatIfHigher('ownedSkillCount', count);
  }

  // ── メタ実績（全実績コンプリート）チェック：他の全実績がunlocked済みか ──
  function checkMetaAchievement(){
    const metaDef = ACHIEVEMENT_DEFS.find(d => d.metaAllComplete);
    if (!metaDef) return;
    const others = ACHIEVEMENT_DEFS.filter(d => d !== metaDef);
    const allDone = others.every(def => getState(def.id).unlocked);
    if (allDone) unlock(metaDef.id);
  }

  // ── 受け取り処理：このゲームには報酬経済（EP等）が無いため、実際には呼び出し元が
  //   存在しない（renderAchievementListTab側もclaim()を呼ばずunlockedのみを見て表示する）。
  //   将来の拡張に備えてAPIとしてだけ残している。 ──
  function claim(id){
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (!def) return null;
    const state = getState(id);
    if (!state.unlocked || state.claimed) return null;
    state.claimed = true;
    state.claimedAt    = formatClaimDate(new Date());
    state.claimedLevel = (typeof playerProgress !== 'undefined') ? playerProgress.level : null;
    persist();
    updateBadges();
    return { claimedAt: state.claimedAt, claimedLevel: state.claimedLevel };
  }

  // ── レベル到達型の実績をまとめてチェック（grantXP後・起動時に呼ぶ） ──
  function checkLevelAchievements(){
    if (typeof playerProgress === 'undefined') return;
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.levelReq && playerProgress.level >= def.levelReq) unlock(def.id);
    }
  }

  // ── 実績達成率：解放済み(unlocked)の割合 ──
  function getCompletionRate(){
    let total = 0, done = 0;
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.metaAllComplete) continue; // メタ実績自身は分母に含めない
      total += 1;
      if (getState(def.id).unlocked) done += 1;
    }
    return total ? done / total : 0;
  }

  window.Achievements = {
    defs: ACHIEVEMENT_DEFS,
    getState,
    getStatValue,
    unlock,
    claim,
    incrementStat,
    setStatIfHigher,
    markSkillUsed,
    markSkillSelected,
    syncOwnedSkillCount,
    checkLevelAchievements,
    checkMetaAchievement,
    updateBadges,
    getCompletionRate,
    getLog,
    markLogSeen,
  };

  // 起動時に一度チェック：この内容更新より前から遊んでいたセーブデータでも、
  // 既に条件を満たしている実績があれば次回起動時にきちんと反映される
  checkLevelAchievements();
  for (const def of ACHIEVEMENT_DEFS) { if (def.statKey) checkStatAchievements(def.statKey); }
  if (typeof saveData !== 'undefined' && Array.isArray(saveData.unlockedSkills)) {
    syncOwnedSkillCount(saveData.unlockedSkills.length);
  }
  checkMetaAchievement();
  updateBadges();
})();
