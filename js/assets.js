// ==========================================================================
// js/assets.js — 画像アセットのパス管理＋事前読み込み（カテゴリ共通）
//
// 実イラスト（SVG/PNG等）は /assets/ 以下のフォルダに実ファイルとして置き、
// このファイルにはパスの一覧と、Imageオブジェクトとして事前読み込みするための
// 薄いユーティリティだけを持たせている（画像データそのものは埋め込まない）。
//
// フォルダ構成（今作で使う分のみ。今後増える分はカテゴリを追加していく想定）：
//   /index.html
//   /js/
//      assets.js   ← このファイル
//   /assets/
//      items/      ← アイテムアイコン
//      skills/     ← スキルアイコン（白色SVG。暗い背景の上に乗せる前提のデザイン）
//      player/     ← 自機（プレイヤー）画像
//      marbles/    ← 玉（磁晶核）イラスト
//      rocks/      ← 岩（覚醒能力）の専用イラスト
//
// 使い方（index.html側）：
//   <script src="js/assets.js"></script>   ← ゲーム本体のscriptタグより前に読み込む
//   IMAGE_ASSETS.preloadAll();              ← ゲーム起動時に1回呼ぶ（読み込みを開始するだけ・待たない）
//   const img = IMAGE_ASSETS.get('items', 's_boost'); ← Imageオブジェクトを取得
//     ※ 読み込みは非同期なので、描画側では img.complete を見てから使うこと
//        （未読込の間は呼び出し側で簡易フォールバック表示にするのが安全）
//
// アイコンを追加・差し替えたい場合：
//   1. /assets/<カテゴリ>/ にファイルを追加する
//   2. 下のIMAGE_ASSET_PATHSに1行追加する（カテゴリが無ければ新設する）
// ==========================================================================

const IMAGE_ASSET_PATHS = {
  items: {
    s_boost:       'assets/items/s_boost.svg',
    n_boost:       'assets/items/n_boost.svg',
    range_up:      'assets/items/range_up.svg',
    chain_multi:   'assets/items/chain_multi.svg',
    explode_up:    'assets/items/explode_up.svg',
    rare_booster:  'assets/items/rare_booster.svg',
    skill_charger: 'assets/items/skill_charger.svg',
    ep_bonus:      'assets/items/ep_bonus.svg',
    bat_stable:    'assets/items/bat_stable.svg',
    bat_unstable:  'assets/items/bat_unstable.svg',
    bat_chaos:     'assets/items/bat_chaos.svg',
  },
  skills: {
    blink:           'assets/skills/skill_blink.svg',
    dash:            'assets/skills/skill_dash.svg',
    cannon:          'assets/skills/skill_cannon.svg',
    typhoon:         'assets/skills/skill_typhoon.svg',
    shield:          'assets/skills/skill_shield.svg',
    bubble:          'assets/skills/skill_bubble.svg',
    beacon:          'assets/skills/skill_beacon.svg', // フリーズハンド専用（手で玉を寄せ集める）新アイコン。旧ワープビーコンの塔アイコンから差し替え済み
    sweep:           'assets/skills/skill_sweep.svg',
    energyConverter: 'assets/skills/skill_energyConverter.svg',
  },
  player: {
    default_s: 'assets/player/player_default_s.webp',
    default_n: 'assets/player/player_default_n.webp',
  },
  marbles: {
    boost:   'assets/marbles/marble_boost.svg',
    homing:  'assets/marbles/marble_homing.svg',
    delay:   'assets/marbles/marble_delay.svg',
    red:     'assets/marbles/marble_red.svg',
    gold:    'assets/marbles/marble_gold.svg',
    gravity: 'assets/marbles/marble_gravity.svg',
  },
  rocks: {
    // 覚醒能力を持つ岩の専用イラスト（反射衛星＝バンパー／分解装置＝分裂／通信中継衛星＝共鳴／ブラックホール）
    bumper:    'assets/rocks/bumper.svg',
    blackhole: 'assets/rocks/blackhole.svg',
    split:     'assets/rocks/split.svg',
    resonance: 'assets/rocks/resonance.svg',
  },
  enemies: {
    // 決戦フェーズの敵イラスト（drawEnemy()）。キーは各ゾーンのkindと一致させている
    swarm:   'assets/enemies/enemy_swarm.webp',   // 雑魚複数体
    squad:   'assets/enemies/enemy_squad.webp',   // 少数精鋭2〜3体
    midboss: 'assets/enemies/enemy_midboss.webp', // 中ボス
    boss:    'assets/enemies/enemy_boss.webp',    // BOSS
  },
  // FB対応：「遊び方(HOWTOPLAY_PAGES)の画像の読み込みが遅い」。原因はファイルサイズでは
  // なく、このカテゴリ一覧に載っておらずpreloadAll()の対象外だったため、各ページの
  // <img>のsrcを実際にセットするその瞬間まで一切リクエストすら始まっていなかったこと
  // （初回は初回起動の自動表示と完全に同じタイミングで、他の初期化処理と競合しながら
  // 今から読み込み始める形になっていた）。ここに登録することで他アセットと同じく
  // ゲーム起動直後から先読みが始まり、実際に開く頃にはブラウザキャッシュ済みになる
  tutorial: {
    page1: 'assets/tutorial/page1.webp',
    page2: 'assets/tutorial/page2.webp',
    page3: 'assets/tutorial/page3.webp',
    page4: 'assets/tutorial/page4.webp',
    page5: 'assets/tutorial/page5.webp',
  },
  // 今後の追加予定（フォルダを作ってからここにカテゴリを追加）：
  // ui:          { ... },
  // backgrounds: { ... },
};

const IMAGE_ASSETS = (() => {
  const images = {}; // "category/id" -> Imageオブジェクト
  let started = false;

  // 全画像の読み込みを開始する（実ファイル参照のため通信・キャッシュはブラウザ標準の挙動に従う）
  function preloadAll() {
    if (started) return;
    started = true;
    for (const category in IMAGE_ASSET_PATHS) {
      const group = IMAGE_ASSET_PATHS[category];
      for (const id in group) {
        const img = new Image();
        img.src = group[id];
        images[`${category}/${id}`] = img;
      }
    }
  }

  // category/id に対応するImageオブジェクトを返す。未定義ならnull
  function get(category, id) {
    return images[`${category}/${id}`] || null;
  }

  return { preloadAll, get };
})();
