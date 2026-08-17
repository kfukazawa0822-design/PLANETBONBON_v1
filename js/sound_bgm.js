// ==========================================================================
// js/sound_bgm.js — BGMシステム
//
// SE（js/sound_se.js）とは再生方式を分けている：BGMは曲が長いので、
// Web Audio APIでメモリに全部展開するのではなく<audio>要素でストリーミング
// 再生（loop）する。1つの<audio>要素を使い回して曲を切り替える方式なので、
// 複数曲を同時デコードすることによる重さは発生しない。
//
// 音声ファイルはまだ用意されていない前提で作っている。再生に失敗しても
// (loadエラー・play()の自動再生ブロック等) ゲーム進行には影響させず、
// 静かに無視する。
//
// BGMを追加・差し替えたい場合：
//   1. assets/sound/bgm/ に音声ファイルを置く（下のBGM_FILESに書いてあるファイル名）
//   2. 場面が増えたらBGM_FILESに1行追加し、該当箇所でBGM.play('キー')を呼ぶ
// ==========================================================================

(function(){
  const BGM_FILES = {
    menu:      'assets/sound/bgm/bgm_menu.mp3',      // モード選択/オプション/実績ログ/ショップ/コレクション一式/スキル選択
    stage:     'assets/sound/bgm/bgm_stage.mp3',     // Play中
    stageEnd:  'assets/sound/bgm/bgm_stage_end.mp3', // Play中・180秒経過後
    result:    'assets/sound/bgm/bgm_result.mp3',    // リザルト画面
    // タイトル画面はBGM無し（キーを渡さない/nullで停止扱い）
  };

  const audioEl = new Audio();
  audioEl.loop = true;
  audioEl.preload = 'auto';
  let currentKey = null;
  let unlocked = false;

  // 初回のユーザー操作で再生を解禁する（iOS/Safari等の自動再生制限対策）。
  // 解禁前にplay()が呼ばれていた場合は、解禁できたタイミングで改めて再生を試みる。
  function unlock(){
    if (unlocked) return;
    unlocked = true;
    if (currentKey && audioEl.paused) {
      audioEl.play().catch(()=>{});
    }
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(evName => {
    document.addEventListener(evName, unlock, { once: true, passive: true });
  });

  function bgmEnabled(){
    return !(typeof settings !== 'undefined' && settings && settings.bgmEnabled === false);
  }

  // key: 'menu' | 'stage' | 'stageEnd' | 'result' | null（nullは停止＝タイトル画面用）
  function play(key){
    if (key === currentKey) return; // 既に同じ曲が流れている場合は何もしない（再スタートによるブツ切れ防止）
    currentKey = key;

    if (!key){
      audioEl.pause();
      return;
    }
    const src = BGM_FILES[key];
    if (!src) return;
    try{
      // OFF中でも「今流れているべき曲」としてsrcは必ず更新しておく。
      // ここをbgmEnabled()で早期returnしてしまうと、OFF中にシーン遷移が起きた場合、
      // audioEl.srcが古い曲のまま更新されず止まってしまい、後でONに戻した瞬間に
      // refresh()が古い曲を再生してしまう（「オフからオンに戻しても音が戻らない」原因）。
      audioEl.src = src;
      audioEl.currentTime = 0;
    }catch(err){ return; /* ファイル未配置などはここで無視 */ }

    if (!bgmEnabled()){
      audioEl.pause(); // OFF中は読み込むだけで再生はしない
      return;
    }
    try{
      const p = audioEl.play();
      if (p && typeof p.catch === 'function') p.catch(()=>{}); // 解禁前の自動再生ブロックは無視（unlock後に再試行される設計）
    }catch(err){ /* 再生失敗はゲームを止めずに無視する */ }
  }

  function stop(){
    play(null);
  }

  // オプション画面でBGM ON/OFFが切り替えられた時に、今流れているべき曲を
  // 再評価するための再適用（曲自体は変えず、on/offだけ反映する）
  function refresh(){
    if (!bgmEnabled()){
      audioEl.pause();
      return;
    }
    if (currentKey && audioEl.paused && unlocked){
      audioEl.play().catch(()=>{});
    }
  }

  // スリープ復帰対策：画面がバックグラウンドから復帰した瞬間に自動で再適用する。
  // （今まではオプションのBGM ON/OFFトグルを手で触った時だけrefresh()が呼ばれていたため、
  //  スリープ復帰後にトグルを触るまでBGMが無音のままだった）
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pageshow', refresh);

  window.SoundBGM = { play, stop, refresh };

  console.log('[sound_bgm.js] 初期化完了。window.SoundBGM を公開しました。');
})();
