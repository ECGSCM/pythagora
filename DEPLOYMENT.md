# Pythagora-Synth デプロイガイド

## Netlify でデプロイ（おすすめ）

### 手順

1. **ビルド**
```bash
npm run build
```

2. **Netlify アカウント作成**
https://www.netlify.com/

3. **ドラッグ＆ドロップ**
- `dist` フォルダを Netlify ダッシュボードにドラッグ

4. **完了！**
- 自動的に URL が発行されます
- `https://xxxxx.netlify.app`


## Vercel でデプロイ

### 手順

1. **Vercel アカウント作成**
https://vercel.com/

2. **GitHub リポジトリを連携**

3. **自動デプロイ設定**
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

4. **完了！**


## GitHub Pages でデプロイ（無料）

### vite.config.ts の設定

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pythagora-synth/', // リポジトリ名
})
```

### デプロイコマンド

```bash
# package.json に追加
"deploy": "npm run build && gh-pages -d dist"

# パッケージ追加
npm install --save-dev gh-pages

# デプロイ
npm run deploy
```

URL: `https://ecgscm.github.io/pythagora-synth/`


## 現在の feature ブランチをマージしてデプロイ

1. main ブランチに切り替え
```bash
git checkout main
git merge feature/sacred-geometry-spinner-fix
git push origin main
```

2. 上記のデプロイ方法を実行


## 環境変数（必要な場合）

なし（このアプリは環境変数不要）
