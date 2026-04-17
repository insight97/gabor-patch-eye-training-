# Gabor Patch Eye Training

最簡版可玩的 Gabor patch 視覺訓練小遊戲（MVP）。

## 現在可以玩的核心功能

- 2AFC 方向判斷：按 `←` / `→` 判斷 Gabor patch 左傾或右傾
- 訓練流程：`3 blocks × 20 trials`
- 難度自適應：`2-down-1-up`（用對比度調整）
- 結果頁：正確率、平均反應時間、threshold 估計
- 個人紀錄：存在瀏覽器 LocalStorage（非 cookie）

## 在本機執行

直接開 `index.html` 即可，或使用簡易靜態伺服器：

```bash
python -m http.server 8000
```

然後打開 `http://localhost:8000`。

## 部署到 GitHub Pages

1. 把這個 repo push 到 GitHub。
2. 在 GitHub Repo → `Settings` → `Pages`。
3. `Build and deployment` 選 `Deploy from a branch`。
4. Branch 選 `main`（或你要發布的 branch），資料夾選 `/ (root)`。
5. 儲存後等待幾分鐘，會得到公開網址。

## 注意

- 本專案為訓練用途，**非醫療診斷或治療工具**。
- 刺激效果會受到螢幕亮度、尺寸、觀看距離影響。
