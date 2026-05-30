# random-char-keyboard

**🔴 Live: https://p4suta.github.io/random-char-keyboard/**

ボタンを押すとランダムな **印字可能 Unicode 文字** を 1 文字出力する「1 キーキーボード」。
コア(ランダム抽出 + 印字可能判定)は **Rust → WebAssembly**、UI は **Solid + Vite + TypeScript**。
**同梱フォントが描画できる文字しか出さない**ので、出力が □(豆腐)になることはありません。

## 構成

- `crate/` — Rust の WASM コア。`random_printable_char()` を export。U+0000..=U+10FFFF を一様サンプルし、**印字可能カテゴリ(`is_printable_char`) かつ 同梱フォント収録(`is_covered`)** の文字だけを返す(棄却サンプリング)。`crate/src/coverage.rs`(`COVERED_RANGES`)は `tools/planner` が生成。
- `frontend/` — Solid + Vite + TypeScript アプリ。物理キーボード風 UI(キーキャップ筐体・**常時スクランブル**するメインキー＋ BKSP/DEL/ENTER・打鍵を貯める**フォーム入力欄**)。メインキー押下でランダム文字を欄に追記、BKSP=末尾1コードポイント削除 / DEL=全消去 / ENTER=改行。スタイルは **Panda CSS**(`panda.config.ts` の `keycap` レシピ＋カラートークン、`styled-system/` は `panda codegen` で生成)。`src/fonts/gen/` の woff2 群を単一 `font-family: "AppGlyph"` として読み込む。
- `tools/` — オフラインのフォント生成パイプライン(下記)。

## フォント — 豆腐ゼロの保証

単一の SFNT フォントはグリフ ID が 16bit のため **最大 65,535 グリフ**しか持てず、全 Unicode(15 万超)を 1 ファイルに入れるのは不可能。そこで Google Fonts と同じ方式を採る:

1. **`tools/planner`(Rust / ttf-parser)** — 約 150 個の Noto Sans 系ソース(`tools/sources/`)を走査し、各コードポイントを「非 .notdef グリフを持つ」優先フォント 1 つに**重複排除して帰属**。`tools/plan.json` ・ `tools/coverage.json` ・ `crate/src/coverage.rs` を出力。
2. **`tools/build_fonts.py`(Python / fontTools)** — 可変フォントを wght=400 に**インスタンス化**し、帰属コードポイントへ **subset** して **woff2** 化。`frontend/src/fonts/gen/chunkNNN.woff2` と、チャンク毎 `unicode-range` を持つ単一 family の `glyph-fonts.css` を生成。ブラウザは「1 つのフォント」として扱い、表示する文字のチャンクだけ取得する。
3. **`tools/verify_fonts.py`(CI)** — 配信 woff2 の cmap を再読込し、**和集合 == `COVERED_RANGES`** ・チャンク相互排他を検証。これが no-tofu の事前チェック(`.github/workflows/ci.yml` の `fonts-verify` ジョブ)。

保証チェーン: `crate/src/coverage.rs` == `tools/coverage.json` == 配信 woff2 の収録集合。サンプラは `COVERED_RANGES` 内しか出さないので、**出力は必ず同梱フォントで描画できる**。

**カバレッジ: 67,144 コードポイント / 148 チャンク / 約 7MB**(ラテン・ギリシャ・キリル・CJK・ハングル・かな・各種歴史的文字(楔形文字等)・記号・数学・絵文字)。
**既知のギャップ**(開いているフォントの都合で対象外、豆腐ではなく「出ない」): CJK 拡張 B 以降(面 2–3 の追加漢字 約 5 万字)など。サンプラはこれらを出しません。

### フォントの再生成

ソースやカバレッジを変えたいとき(普段は不要、生成物はコミット済み):

```bash
# 1) ソース取得(初回のみ。tools/sources/ は .gitignore)
bash tools/fetch_sources.sh
# 2) Python 環境
uv venv tools/.venv && uv pip install --python tools/.venv/bin/python fonttools brotli
# 3) Rust planner -> coverage.rs / plan.json、fontTools -> woff2 / css、検証
cargo run --release --manifest-path tools/planner/Cargo.toml
tools/.venv/bin/python tools/build_fonts.py
tools/.venv/bin/python tools/verify_fonts.py
```

## 開発

前提: Rust(+ `rustup target add wasm32-unknown-unknown`)、`wasm-pack`、`pnpm`。

```bash
cd frontend
pnpm install
pnpm run dev      # 内部で wasm-pack -> vite。http://localhost:5173/random-char-keyboard/ を開く
```

`base` を `/random-char-keyboard/` に設定しているため、開発/プレビューとも URL は **サブパス配下**(`/random-char-keyboard/`)になります。ルート `/` は空白になります(故障ではありません)。

`pnpm install` 時に `prepare` フックが `panda codegen` を実行し `styled-system/`(gitignore)を生成します。`dev`/`build`/`test` も内部で codegen を前置。`frontend/pnpm-workspace.yaml` の `allowBuilds: { esbuild: true }` は、pnpm 11 が既定でブロックする esbuild の postinstall を承認するためのものです(無いと `pnpm install` が非ゼロ終了し `pnpm run` がこける)。

その他のスクリプト: `pnpm run build`(本番ビルド)、`pnpm run preview`、`pnpm run check`(Biome)、`pnpm test`(Vitest)。

## テスト

- `cd crate && cargo test` — 印字可能判定・`COVERED_RANGES` の整合(ホスト)。
- `cd crate && wasm-pack test --node` — 実 WASM サンプラが印字可能∧収録の単一スカラのみ返すこと。
- `cd frontend && pnpm test` — `toLabel` ・コンポーネント(履歴上限・遅延フォントロード)。
- `tools/.venv/bin/python tools/verify_fonts.py` — no-tofu の網羅検証。

## デプロイ(GitHub Pages)

`.github/workflows/deploy.yml` が `main` への push で Rust→WASM をビルドし `frontend/dist` を Pages に公開します。初回のみ手動設定が必要です:

1. GitHub にリポジトリを作成(リポジトリ名は **random-char-keyboard**。別名にする場合は `frontend/vite.config.ts` の `base` を合わせる)。
2. `git init && git add -A && git commit` して push(`pnpm-lock.yaml`・`frontend/src/fonts/gen/`・`crate/src/coverage.rs` も必ずコミット。CI は `--frozen-lockfile`)。
3. リポジトリの **Settings → Pages → Build and deployment → Source = "GitHub Actions"** を選択。
