# Pythagora Synth — 完全リファクタリング計画

**作成日**: 2026-07-03
**目的**: 物理演算×シンセサイザー「Pythagora Synth」を、蓄積した死コード・バグ・未接続機能を全て排除し、`CREATIVE_ENHANCEMENT_PLAN.md` に記された本来のビジョン(催眠的アンビエント体験 + ピタゴラスイッチ的達成感)が妥協なく機能する状態に再設計する。

---

## 0. 現状診断サマリ(3系統の完全監査結果)

### 0.1 計測値

| 項目 | 現状 |
|---|---|
| `tsc -b` | 通過(ただし `strict: false` で骨抜き) |
| `pnpm lint` | **101 エラー**(大半が死コード内の `any`) |
| `pnpm test:run` | **23/31 失敗**。しかも既存テストは **100% 死コードを対象**にしている |
| バンドル | 約 2.2 MB(three 系が大半。空チャンク `supabase`/`state` を生成) |
| 実コード | 約 6,900 行中、**約 2,900 行が到達不能な死コード** |

### 0.2 死んでいるもの(到達性解析済み)

- **ファイル**: `PhysicsCanvas.tsx`(旧2D版)、`PresetDropdown.tsx`(+test)、`SidebarControls.tsx`、`SacredGeometry.tsx`、`engines/physics.ts`(※`CollisionEvent` 型のみ生存)、`engines/synthBridge.ts`(+test)、`utils/supabase.ts`、`types/supabase.types.ts`、`config/index.ts`、`App.css`、`db.types.ts` の大半(生存は `PatchNode` のみ)
- **npm 依存**: `@stripe/stripe-js`、`@supabase/supabase-js`、`@tanstack/react-query`、`zustand`(→ Phase 3 で正式採用に転換)、`matter-js`、`workbox-window`
- **バックエンド**: `supabase/` ツリー全体(マイグレーション、sync/payments Edge Functions)。フロントエンドから呼ぶコードが一切存在しない
- **CI**: Vercel デプロイ + Supabase デプロイ + 廃止済み `actions/*@v3` を参照する 251 行のワークフロー。`vite.config.ts` の `base: '/pythagora/'`(GitHub Pages 用)と根本矛盾
- **ドキュメント**: README が主張する機能(Stripe 決済、コース、リアルタイムコラボ、MIDI/OSC、Husky、Prettier、`hooks/`・`stores/` ディレクトリ)は**ほぼ全て実体なし**

### 0.3 致命バグ(音声エンジン `audio.ts` / `synthBridge3D.ts`)

| ID | 内容 |
|---|---|
| A1 | `dispose()` が**構造的に一度も呼ばれない**(`useEffect` の stale closure が `null` を捕捉)。再マウントごとにエンジン全体がリーク |
| A2 | コンストラクタで開始する 100ms `setInterval` の ID を保存せず、**永遠に停止不能** |
| A3 | 最頻発の衝突音(マーブル対壁・床)が `.toDestination()` 直結で**マスターチェーンを完全バイパス** — ミュート・エコー・コンプ・リミッター全て無効 |
| A4 | ミュートが `-Infinity` → クランプで **-60dB** になり真の無音にならない |
| A5 | `onCollision` コールバックが**1衝突につき2回発火**(bridge 内部経由 + 直接呼び出し) |
| A6 | 全8音色でクリーンアップ `setTimeout` がエンベロープ長より **0.3〜3 秒短く**、リリース途中で強制 dispose → **毎回クリックノイズ** |
| A7 | ファンネル音はエンベロープ自体が存在せず、鳴りっぱなしのサイン波を 2 秒後にぶつ切り |
| A8 | ボイスプールのゲインが **dB とリニアゲインを混同**(`Gain(-12)` = 位相反転12倍増幅) |
| A9 | ポリフォニー上限(24音)は Map のキーが音色名固定(最大8エントリ)のため**構造的に発動不能**。同音色連打で管理エントリが上書き・誤削除される競合あり |
| A10 | 衝突ごとに 6〜20 個の Tone.js ノードを新規生成(プーリングなし)。低スペック端末で音切れの主因 |

### 0.4 致命バグ(3D/物理 `Physics3DCanvas.tsx`)

| ID | 内容 |
|---|---|
| P1 | **ランプの物理コライダーが回転していない**。`useBox` に `rotation` を渡さず見た目だけ傾斜 → マーブルは坂を転がらない(ゲームの根幹が壊れている) |
| P2 | スピナーはメッシュだけ回転し、コライダーは静止。回転による弾き効果ゼロ。専用衝突リスナーは存在しない API (`ref.api`) を参照し永久に不発 |
| P3 | シーソーは静的ボックスで、**シーソー機構が全く存在しない** |
| P4 | `useSphere` に deps 未指定 → `onCollide` が**マウント時の状態を永久凍結**。コンボ/スコア/アンロック系全体が信頼不能 |
| P5 | 衝突デバウンスなし。接触継続中は物理ステップごとに音+リップル+コンボが**連射**される |
| P6 | マーブル完了判定が state 上の**初期スポーン座標**を参照(実座標は ref 内のみ)→ 完了判定・完了演出は永久に発火せず、除去は「10個超で古い順に空中から消す」だけ |
| P7 | クリック位置の **z 座標(奥行き)を y(高さ)に加算して捨てる**ハック。全モジュールは z=0 に強制配置 |
| P8 | キーボード操作はラッパー div のフォーカス必須だが、フォーカスを与えるコードが存在せず**初期状態で全ショートカット無効** |
| P9 | 案内表示にある `C`(全消去)/`H`(ヘルプ)/`ESC` キーは**未実装**。`handleClearAll` は定義済み・未配線 |
| P10 | funnel/bell に `params` 未伝達、seesaw は受け取って無視。`node.size` も生成されるが誰も読まない |
| P11 | Bumper/Chime/Bell のヒット発光 state は**セットする側が存在せず**永久に不発 |

### 0.5 パフォーマンス問題

- 衝突のたびに `displayStats` 更新(**表示する UI が存在しない**)→ `Physics3DCanvas` 全体再レンダー → inline props 再生成で `Scene` の memo 無効化 → 全モジュール再レンダー、の連鎖
- 環境パーティクルが JSX 内 `Math.random()` 直書きのため**再レンダーごとに瞬間移動**
- `ContactShadows` が `frames` 未指定(= Infinity)で毎フレーム 1024×1024 の depth+blur×2 パスを実行
- `shadows={false}` なのに全ライト・全メッシュに shadow 設定が残存
- リップルが毎フレーム `setState`
- **実装済みなのに一度もレンダーされていない機能**: `CameraFlow`(マーブル追従カメラ)、`ComboDisplay`(コンボ表示)、`PerfectRunIndicator`、`ParticleTrail`(軌跡パーティクル)— state だけ毎衝突更新され続けている

### 0.6 ビジョンとのギャップ(`CREATIVE_ENHANCEMENT_PLAN.md` 対比)

| ビジョン機能 | 実装状況 |
|---|---|
| Ambient Drone System | **未着手** |
| Harmonic Resonance Chain(五度圏) | 実装済みだが呼び出しがコメントアウト + A8 のゲインバグで再有効化しても壊れる |
| Reverb Tail System | パラメータ制御だけ毎衝突動作、**音声経路が未接続で一切聞こえない** |
| Binaural Beats Mode | 未着手 |
| Procedural Melody | 衝突履歴の収集のみ。生成ロジックなし |
| コンボ/アンロック/Perfect Run | ロジックは存在するが P4/P6 で壊れており、表示コンポーネントは未マウント |

**結論**: 「総合点50点」の正体は、(1) 全体の4割を占める死コード、(2) ゲームの根幹(坂を転がる・回る・傾く)の物理バグ、(3) 作り込まれたのに配線されていない体験機能群、の3層構造。**書き直しではなく、正しい配線と外科手術で救える資産が多い。**

---

## 1. 設計上の決定事項(この計画の前提)

1. **クライアントサイド完結の静的アプリ**とする。Supabase / Stripe / Vercel / 認証 / 課金は完全撤去。パッチ保存が将来必要になれば `localStorage` + URL 共有で実現する(サーバ不要)。根拠: フロントエンドから backend を呼ぶコードが一切なく、`DEPLOYMENT.md` 自身が「環境変数不要」と明言している。
2. **デプロイ先は GitHub Pages に一本化**(`base: '/pythagora/'`、`gh-pages` スクリプトと git 履歴が示す実際の運用先)。Vercel/Netlify 記述は削除。
3. **ゲーム空間は 2.5D(z=0 の垂直面)を正式仕様とする**。ピタゴラ装置は垂直面のマーブルランであり、奥行き配置は操作性を悪化させるだけ。クリックは z=0 垂直プレーンへのレイキャストで x/y を決める(P7 のハック廃止)。カメラは 3D 視点のまま。
4. **状態管理に zustand を正式採用**(既に依存に存在)。コンボ・スコア・セッション状態を React レンダーパスから分離し、再レンダー連鎖(0.5)を根絶する。`@tanstack/react-query` は削除。
5. **音色定義をデータ化し、ボイス管理を一元化**する。「楽器定義(周波数・エンベロープ・フィルタ)」と「エンジン配管(バス・プール・寿命)」を分離。クリーンアップ時間は必ず `attack+decay+duration+release` から導出する。
6. **UI は MUI + 現行の Divine Monochrome テーマを維持**(生きており、テーマとして一貫している)。
7. テストは**生きているコードだけ**を対象に書き直す。旧 2D 系テストとその専用モック群は全廃。

---

## 2. フェーズ計画

実行体制: 設計・監査・レビュー・最難関実装 = メインセッション(Fable 5)。機械的・定型的な実装 = Sonnet サブエージェント。難易度中〜高の実装 = Opus サブエージェント。**各フェーズ末尾の検証ゲートを通過するまで次フェーズに進まない。**

### Phase 1: 大掃除(Demolition)
**担当: Sonnet / レビュー: Fable**

- 死ファイル削除: `PhysicsCanvas.tsx`, `PresetDropdown.tsx`(+test), `SidebarControls.tsx`, `SacredGeometry.tsx`, `engines/physics.ts`, `engines/synthBridge.ts`(+test), `utils/supabase.ts`, `types/supabase.types.ts`, `config/index.ts`, `App.css`, `supabase/` ツリー全体
- `CollisionEvent` 型は `engines/` 内の適切な型ファイルへ移設(現 `physics.ts` から救出)
- `db.types.ts` → `PatchNode` 系のみ残し `types/patch.ts` に改名。`User/Patch/Course/Module/Lesson/HealthFrequencyPreset` 削除
- 依存削除: `@stripe/stripe-js`, `@supabase/supabase-js`, `@tanstack/react-query`, `matter-js`, `@types/matter-js`, `workbox-window`(lockfile 再生成をここで意図的にコミット)
- `vite.config.ts`: 空チャンク `supabase`/`state` の manualChunks 削除、PWA アイコンのプレースホルダ課題を記録
- `src/test/setup.ts`: matter-js / Canvas2D モックを削除し、Tone モックのみ最小化
- `index.html` タイトルを「Pythagora Synth」に修正
- `.github/workflows/ci.yml` 全面書き換え: lint + tsc + test + build のみ(デプロイは Phase 6 で GitHub Pages 用に追加)。廃止 actions を排除
- `.env.example` 削除(環境変数ゼロが正)。`README.md` / `DEPLOYMENT.md` を実態に一致させ全面書き換え
- `tsconfig.app.json` を `strict: true` + `noUnusedLocals` + `noUnusedParameters` に引き上げ、発生したエラーをこのフェーズで解消

**ゲート**: `tsc -b`(strict)・`pnpm lint` 0 エラー・`pnpm build` 成功・`pnpm test:run` 全通過(残存テストのみ)・アプリが手動起動で現状同等に動作

### Phase 2: コア修正 — 物理(ゲームの根幹を直す)
**担当: Fable(コライダー/拘束設計)+ Opus(実装補助)**

- **P1**: ランプの `useBox` に `rotation` を渡し、視覚と物理を一致させる(角度は `params.angle` から)
- **P2**: スピナーを `Kinematic` ボディ化し `api.angularVelocity` で回転(コライダーが実際に回り、マーブルを弾く)。死んだ `ref.api` リスナー削除
- **P3**: シーソーを `useHinge`(cannon の HingeConstraint)+ Dynamic ボディで実装し、マーブルの重みで傾く本物のシーソーにする
- **P4**: 全ボディの `onCollide` を stale closure から解放(ハンドラを ref 経由で最新化する `useEventCallback` パターン、または zustand ストア直接参照)
- **P5**: 衝突デバウンス導入: 同一ペア(marble×module)に対しクールダウン(例 80ms)+ 衝突相対速度しきい値。音量を衝突速度に比例させる(velocity-sensitive、ビジョンの「振幅=エフェクト強度」に接続)
- **P6**: マーブル実座標を物理 API (`api.position.subscribe`)で追跡し、落下完了判定・完了演出・除去を正しく機能させる。FIFO 強制消去は「フェードアウトして消す」に変更
- **P7**: z 流用ハック廃止。z=0 垂直プレーンへのレイキャストで配置(決定事項3)。`PatchNode.position` は `{x, y}` のまま(仕様として正しくなる)
- **P8/P9**: キーボードを `window` レベルの `keydown` リスナーに変更(フォーカス問題根絶)。`C`(全消去=既存 `handleClearAll` を配線)、`H`(ヘルプ表示トグル)、`ESC`(ランディングへ戻る)を実装
- **P10**: funnel/bell/seesaw への `params` 伝達を修正。`node.size` は使うか捨てるか決定(→ モジュール寸法定数を config に集約し `size` フィールドは削除)
- **P11**: ヒット発光を実際の衝突イベントに配線(zustand 経由で該当 nodeId のモジュールに hit パルスを届ける)

**ゲート**: 手動検証シナリオ「ランプに落としたマーブルが坂を転がり、スピナーに弾かれ、シーソーを傾けて落ちる」が成立。連続接触で音が連射されない。Space/1-8/M/D/C/H/ESC が初回ロード直後に機能

### Phase 3: コア修正 — 音声エンジン再構築
**担当: Fable(アーキテクチャ+ボイス管理)+ Opus(音色データ移植)**

構成変更: `engines/audio.ts`(1765行の単一クラス)を分割:
```
src/audio/
  bus.ts          — マスターチェーン(compressor → limiter → volume)+ send バス(echo, reverb)
  instruments.ts  — 8音色の宣言的定義(osc構成・ADSR・フィルタ・寿命は導出)
  voices.ts       — 全音色共通のボイスプール+真のポリフォニー上限+盗み(voice stealing)
  engine.ts       — 公開API(trigger/mute/echo/dispose)、ライフサイクル管理
  harmony.ts      — 五度圏進行(修復して再有効化)
```
- **A1/A2**: dispose を到達可能に(`useEffect` cleanup をref パターンで修正)、interval ID 保持と `clearInterval`、`destroy()` で全ノード(compressor/limiter/reverb/プール含む)を確実に破棄
- **A3/A4**: 全音色(default 含む)をマスターチェーン経由に統一。ミュートは `Tone.Destination.mute = true` による真のミュート
- **A5**: 衝突イベント経路を一本化(bridge 内部コールバックか直接呼びかを一方に統一)
- **A6/A7**: 寿命を `computeVoiceLifetime(envelope, duration)` で導出し、dispose 前に短いフェードを挟む。ファンネルにエンベロープを実装
- **A8/A9/A10**: ボイスプールを全音色に拡張。`Gain` はリニア値(または `Tone.Volume` で dB)に統一。ポリフォニー上限を実際に機能させる(インスタンスID管理)
- `synthBridge.ts`/`synthBridge3D.ts` の重複を解消 → `synthBridge3D.ts` を `engine.ts` に吸収し bridge 層自体を廃止(物理イベント→エンジンAPI 直結)
- 死んだ公開 API(`activateHealthFrequency` スタブ、`createGlitchEffect`、`getReverbStatus` 等)を削除。生かすもの(reverb 制御)は Phase 4 の Ambient 系に接続
- `createNode` 系(旧パッチグラフ用の重複音色ビルダー群)を削除

**ゲート**: 単体テスト(寿命導出、プール上限、盗み、mute、イベント一本化)。手動検証: クリックノイズ消滅、ミュートで完全無音、エコー切替が全音色に効く、連打してもノイズ・音割れなし。再マウント後に `Tone.context` 上のノード数が増殖しない

### Phase 4: アーキテクチャ整理(1678行コンポーネントの解体)
**担当: Opus / 設計・レビュー: Fable**

```
src/
  stores/gameStore.ts    — zustand: combo, unlocks, sessionStats, perfectRun, marbles/ripples
  config/world.ts        — 物理定数・モジュール寸法・色・カメラ・ライト・ゲームチューニング値(0.4/0.5 で列挙した全マジックナンバーを集約)
  components/canvas/
    Scene.tsx            — 構成のみ(~100行)
    modules/{Ramp,Bumper,Chime,Spinner,Funnel,Seesaw,Bell}.tsx
    Marble.tsx / Ripple.tsx / effects/*.tsx
  components/ui/         — オーバーレイUI(操作パネル、ヘルプ、通知)
```
- コンボ・スコア更新を zustand に移し、`Scene` 再レンダー連鎖を根絶(表示コンポーネントだけがセレクタ購読)
- `displayStats` の無意味な再レンダーループ削除(または実際に表示する UI を付ける — Phase 5 で判断)
- リップルを ref 駆動 + `frames` 制限付きに、環境パーティクルを `useMemo` 化
- `ContactShadows` に `frames` 指定 or 低頻度更新、死んだ shadow props 一掃
- 全コンポーネントの `any` props を正式な型に置換
- `React.memo` の比較関数を props 安定化とセットで整理

**ゲート**: `tsc` strict 通過。React DevTools Profiler で「衝突1回あたりの再レンダーが表示系コンポーネントのみ」であること。挙動は Phase 2/3 完了時点と同一(純粋なリファクタリング)

### Phase 5: ビジョン実装(やりたかったことを全部機能させる)
**担当: Fable(音響設計)+ Opus(視覚/ゲームループ)+ Sonnet(UI 配線)**

音響(CREATIVE_ENHANCEMENT_PLAN §Audio):
- **Ambient Drone System**: 528Hz 基調 3 レイヤー(Deep Bass / Harmonic Pad / Ethereal)+ 0.1–0.5Hz LFO。衝突で一時的にレイヤー強化。ミュート・マスターチェーンに正しく従属
- **Harmonic Resonance Chain**: 修復済み五度圏進行を再有効化し、衝突音のピッチ選択に接続(マーブルが進むほど音楽的に展開)
- **Reverb Tail**: 既存の動的 decay 制御を**実際に音が通る** send バスとして接続(8–15s hall)
- **Procedural Melody**: 衝突履歴(既に収集済み)からスケール内音高を選ぶ簡易生成器
- **Binaural Beats Mode**: L/R ±4Hz のオプションモード(UI トグル付き)

視覚・ゲームループ(既に書かれている資産の配線が中心):
- `ComboDisplay` / `PerfectRunIndicator` / `ParticleTrail` / `CameraFlow` をマウントし、Phase 2 で修復した正しい状態系に接続
- ヒット発光(P11 修正済み)+ 完了演出(P6 修正済み)を磨き込み
- Breathing Light(モジュールの 4–6 秒周期の呼吸明滅)
- コンボ連鎖の音響強化(5/10/20 チェーンでドローンレイヤー変化)

**ゲート**: ビジョン文書の Audio 5 項目・主要ゲームループ項目ごとに動作確認チェックリストを作り、全項目に「実際に見える/聞こえる」証拠を付す。60fps 維持(DevTools 計測)

### Phase 6: テスト・CI・仕上げ
**担当: Sonnet / レビュー: Fable**

- テスト新設: `audio/voices`(寿命・上限・盗み)、`audio/harmony`(進行)、`stores/gameStore`(コンボ・アンロック遷移)、衝突デバウンス、`App` スモーク
- CI 完成: lint + tsc + test + build + GitHub Pages デプロイ(`actions/deploy-pages`、base path 検証付き)
- PWA: 実アイコン作成(vite.svg 置換)、manifest 整備
- バンドル最適化: three 系チャンク検証、MUI ツリーシェイク確認、`update-browserslist-db`
- README 最終化(実際の機能のみ、日本語/英語併記)、`DEPLOYMENT.md`/`PERFORMANCE_OPTIMIZATION.md`/`CREATIVE_ENHANCEMENT_PLAN.md` は履歴として `docs/` へ移動または削除
- 最終監査: Fable が全диff をレビューし、`/code-review` 相当の総点検

**ゲート**: CI 全緑。Lighthouse(ローカル)Perf/A11y 計測。クリーンな環境で `pnpm install && pnpm build && pnpm preview` が一発成功

---

## 3. 共通検証ゲート(全フェーズ適用)

1. `pnpm lint` — 0 エラー 0 警告
2. `tsc -b` — strict で通過
3. `pnpm test:run` — 全通過
4. `pnpm build` — 成功
5. フェーズごとの手動動作確認(上記)
6. コミットはフェーズ内の論理単位ごとに分割し、`claude/physics-synth-refactor-8hj6d4` へプッシュ

## 4. リスクと対処

- **音の主観品質**: エンベロープ・音色の数値変更は「クリック除去」目的に限定し、音色キャラクターは維持する(Phase 3)。音色の作り直しはビジョン実装(Phase 5)で行い、フェーズを混ぜない
- **物理挙動の変化**: P1/P2/P3 修正でゲームの難易度・手触りが大きく変わる(今まで坂が機能していなかったため)。Phase 2 ゲートで重力・反発・摩擦の再チューニングを含める
- **cannon-es の制約**: HingeConstraint(シーソー)と Kinematic 回転(スピナー)は @react-three/cannon の API 制約を先に検証してから実装する(Fable 担当の理由)
