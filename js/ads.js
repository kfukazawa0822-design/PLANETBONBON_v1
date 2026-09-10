// ==========================================================================
// js/ads.js — AdMob広告（インタースティシャルのみ）
//
// 【全体方針】
//   @capacitor-community/admob はネイティブプラグインなので、Capacitorの
//   ネイティブブリッジが自動で公開する window.Capacitor.Plugins.AdMob を
//   直接叩く（このプロジェクトはバンドラーを使っていないため、
//   import文でのプラグイン読み込みはできない／不要）。
//   ブラウザで直接開いた場合（Capacitorが無い環境）は、広告無しでそのまま
//   素通り（onDoneを即座に呼ぶ）にして、開発中の動作確認を止めない。
//
//   呼び出し側（index.html の withResultInterstitial()）から見た
//   インターフェースは window.Ads.showInterstitial(onDone) の1つだけ。
//
// 【テスト広告について】
//   今はGoogleが公式に配布している「テスト広告ユニットID」を常に使う
//   （USE_TEST_ADS = true）。本番のAdMobアカウント・広告ユニットIDを
//   取得したら、下のPROD_INTERSTITIAL_IDを実際の値に書き換えたうえで
//   USE_TEST_ADS を false にすること（このJS内の切り替えだけでは不十分で、
//   android/app/src/main/AndroidManifest.xml 側のAppIDも本番のものに
//   差し替える必要がある。下記参照）。
//   ＊本番の広告ユニットIDに対して開発中の実機で表示・タップを繰り返すと、
//   　AdMobの規約違反（無効なトラフィック）として警告・アカウント停止の
//   　対象になり得るため、テスト広告での確認が終わるまでは絶対にfalseに
//   　しないこと。
//
// 【AndroidManifest.xmlについて（本番リリース時・要・手動対応）】
//   AdMobのAppID（ca-app-pub-xxxx~yyyy）は、このJSファイルではなく
//   android/app/src/main/AndroidManifest.xml の<application>タグ内に
//   下記のmeta-dataとして書かれている。今はGoogle公式のテスト用AppIDを
//   入れてあるので、本番リリース前に自分のAdMobアカウントで取得した
//   本番AppIDに書き換えること。
//     <meta-data
//       android:name="com.google.android.gms.ads.APPLICATION_ID"
//       android:value="（本番のAppIDに差し替え）"/>
// ==========================================================================
(function(){
  const USE_TEST_ADS = true; // 本番リリース直前にfalseへ（本番IDに切り替わる）

  // Googleが公式に配布しているテスト広告ユニットID（誰でも使える固定値）
  const TEST_INTERSTITIAL_ID = 'ca-app-pub-3940256099942544/1033173712';

  // 本番広告ユニットID（AdMobで実際に広告ユニットを作成したらここに差し替え。
  // USE_TEST_ADS=falseの時だけ使われる）
  const PROD_INTERSTITIAL_ID = 'ここに本番のインタースティシャル広告ユニットIDを入れる';

  const INTERSTITIAL_AD_ID = USE_TEST_ADS ? TEST_INTERSTITIAL_ID : PROD_INTERSTITIAL_ID;

  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  const AdMob = isNative && Capacitor.Plugins ? Capacitor.Plugins.AdMob : null;

  // ── ここから下：Capacitorネイティブ環境（実機/エミュレータ）での実装 ──────
  let interstitialReady = false;
  let interstitialLoading = false;

  // 前作（MAGNET BON BON）で実際に踏んだ不具合の再発防止：
  // prepareInterstitial()が最初の1回失敗すると（AdMob初期化がまだ終わって
  // いない・起動直後のネットワーク瞬断など、一過性の理由であっても）、
  // それ以降どこからも再試行される仕組みが無いと、広告が永久に準備されず
  // 「未準備」判定のまま素通りし続けることになる。
  // 対策：読み込み失敗のたびに、間隔を少しずつ延ばしながら自動で再試行する。
  let interstitialRetryTimer = null;
  let interstitialRetryDelay = 5000;
  const AD_RETRY_MAX_DELAY = 60000;
  function scheduleInterstitialRetry(){
    if (interstitialRetryTimer) return; // 既に予約済みなら重複予約しない
    console.warn('[ads.js] インタースティシャル準備失敗 → ' + (interstitialRetryDelay/1000) + '秒後に自動リトライ');
    interstitialRetryTimer = setTimeout(() => {
      interstitialRetryTimer = null;
      prepareInterstitial();
    }, interstitialRetryDelay);
    interstitialRetryDelay = Math.min(interstitialRetryDelay * 2, AD_RETRY_MAX_DELAY);
  }

  function prepareInterstitial(){
    if (!AdMob || interstitialLoading) return;
    interstitialLoading = true;
    interstitialReady = false;
    AdMob.prepareInterstitial({ adId: INTERSTITIAL_AD_ID, isTesting: USE_TEST_ADS })
      .catch(err => { console.warn('[ads.js] prepareInterstitial失敗:', err); scheduleInterstitialRetry(); })
      .finally(() => { interstitialLoading = false; });
  }

  if (AdMob) {
    AdMob.addListener('interstitialAdLoaded', () => { interstitialReady = true; interstitialRetryDelay = 5000; });
    AdMob.addListener('interstitialAdFailedToLoad', (err) => { interstitialReady = false; console.warn('[ads.js] interstitialAdFailedToLoad受信:', err); scheduleInterstitialRetry(); });
    // Dismissed/FailedToShowはshowInterstitial()側のPromise解決でも拾えるが、
    // ユーザーが広告一覧から戻る操作等でPromiseが解決しないケースの保険として
    // イベント側でも「次に備えて再読み込み」を必ず行っておく
    AdMob.addListener('interstitialAdDismissed', () => { interstitialReady = false; prepareInterstitial(); });
    AdMob.addListener('interstitialAdFailedToShow', () => { interstitialReady = false; prepareInterstitial(); });

    // 前作で踏んだ不具合の再発防止：AdMob.initialize()の完了を待たずに
    // prepareInterstitial()を呼ぶと、ネイティブSDK初期化がまだ終わっていない
    // タイミングで静かに失敗することがある。initialize()が確実に完了して
    // からprepareを呼ぶ。
    console.log('[ads.js] AdMob.initialize呼び出し開始（isTesting=' + USE_TEST_ADS + '）');
    AdMob.initialize({ initializeForTesting: USE_TEST_ADS }).then(() => {
      console.log('[ads.js] AdMob初期化成功 → 広告の先読みを開始');
      prepareInterstitial();
    }).catch(err => {
      console.warn('[ads.js] AdMob初期化失敗:', err);
      // 初期化自体が失敗した場合も、諦めずに広告の先読みだけは試しておく
      // （バージョンによっては初期化失敗後もprepareが通ることがあるため）
      scheduleInterstitialRetry();
    });
  }

  // インタースティシャルを表示する。onDone()は「広告を見せた／見せなかった」に
  // 関わらず必ず1回だけ呼ばれる＝呼び出し側は常にonDoneの中で元の処理を続行すればよい
  // （表示するかどうかの確率判定は呼び出し側で行う。ここは「準備できていれば見せる」だけ）
  let interstitialShowing = false;
  function showInterstitial(onDone){
    if (typeof onDone !== 'function') onDone = () => {};
    if (!AdMob || !interstitialReady || interstitialShowing) {
      // 保険：準備できていない状態で呼ばれた＝どこかで先読みが止まっている可能性があるため、
      // 今回は諦めて素通りしつつ、裏で先読みを試みておく（次回に間に合わせる）
      if (AdMob && !interstitialReady && !interstitialShowing && !interstitialLoading) prepareInterstitial();
      onDone(); return;
    }

    interstitialShowing = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      interstitialShowing = false;
      onDone();
    };
    AdMob.showInterstitial().then(() => {
      // showInterstitial自体はshow開始の成否のみを返す実装が多く、実際の「閉じた」
      // タイミングはinterstitialAdDismissedイベント側で拾う必要があるバージョンもあるため、
      // 両対応：このthen()到達後、閉じるイベントを一定時間待っても来なければ念のため進める
      try {
        const onDismiss = () => { cleanupListeners(); finish(); };
        const onFailShow = () => { cleanupListeners(); finish(); };
        let removeDismiss = null, removeFailShow = null;
        function cleanupListeners(){
          if (removeDismiss) removeDismiss.remove();
          if (removeFailShow) removeFailShow.remove();
        }
        // 前作で踏んだ不具合の再発防止：実機では AdMob.addListener() が
        // Promiseを返さないことがある（型定義上はPromise<PluginListenerHandle>だが、
        // 実際のAndroid実装では同期的にハンドルを返すケースがあり、直接.then()を
        // 繋ぐと「...addListener(...).then is not a function」で例外になり、
        // 以降ゲームの「もどる／リトライ」ボタンが無反応のまま固まってしまう）。
        // Promise.resolve()で包むと、Promiseが返っても・素のハンドルが返っても、
        // どちらでも安全に扱える。
        Promise.resolve(AdMob.addListener('interstitialAdDismissed', onDismiss)).then(h => { removeDismiss = h; });
        Promise.resolve(AdMob.addListener('interstitialAdFailedToShow', onFailShow)).then(h => { removeFailShow = h; });
        // 保険：万一イベントが来ない場合でもゲーム進行を止めないためのフォールバックタイムアウト
        setTimeout(() => { cleanupListeners(); finish(); }, 15000);
      } catch (err) {
        // ここで想定外の例外が出ても、ゲーム進行を止めないことを最優先する
        console.warn('[ads.js] showInterstitial（表示後リスナー登録）で例外:', err);
        finish();
      }
    }).catch(err => {
      console.warn('[ads.js] showInterstitial失敗:', err);
      finish();
    });
  }

  // ── 公開インターフェース（呼び出し側はネイティブ/ブラウザの区別を意識しない） ──
  window.Ads = {
    showInterstitial, // 非ネイティブ環境ではAdMobが無いため常にすぐonDone()が呼ばれる（＝広告無しで素通り）
  };
  console.log('[ads.js] 初期化完了（' + (isNative ? 'AdMobネイティブ' : 'ブラウザ（広告無し）') + '版）。');
})();
