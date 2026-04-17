# Gabor Patch Eye Training（MVP 設計）

> 目標：做一個「可在瀏覽器使用」的 Gabor patch 視覺訓練小遊戲，先用最小可行產品（MVP）驗證：
> 1) 使用者願意持續訓練、2) 難度調整合理、3) 可量化訓練趨勢。

## 1) 訓練方法研究摘要（給產品設計用）

以下是我整理後、可直接轉成產品機制的共通做法：

- **核心任務**：以 Gabor patch 做「方向辨識」或「對比閾值偵測」的二選一任務（2AFC）。
- **漸進式難度**：多數研究會用 staircase（如 2-down-1-up）自動調整刺激難度，逼近個人閾值。
- **短時呈現 + 固視點**：先顯示 fixation，再短暫呈現刺激（例如 100–250ms 級別），降低「慢慢看」的補償。
- **即時回饋**：每題給對/錯回饋，有助於學習動機與穩定訓練。
- **訓練指標**：常見追蹤是閾值、正確率、反應時間、session 間改善斜率。
- **可遷移但有限**：改善通常最明顯在「受訓任務/空間頻率附近」，跨任務遷移需要額外設計。

> 產品推論：MVP 應該先專注於「單一任務 + 穩定難度自適應 + 清楚進步曲線」，不要一開始塞太多模式。

## 2) MVP 產品定位

- **一句話定位**：
  「每天 5–8 分鐘，用 Gabor 方向判斷小遊戲訓練視覺分辨能力，看到自己的閾值進步。」

- **目標使用者（先 narrow down）**：
  - 一般對視覺訓練有興趣的成人（非醫療治療宣稱）。
  - 想做注意力/視覺敏感度訓練的玩家。

- **MVP 成功指標（4 週）**：
  - Day-7 留存率 > 25%
  - 平均每週完成 > 4 次 session
  - 至少 60% 使用者在第 2 週後閾值有改善趨勢

## 3) 遊戲規則（MVP）

### 核心玩法：Tilt Hunter（傾斜獵人）

- 每回合顯示一個 Gabor patch（例如左傾 / 右傾）。
- 玩家必須在限定時間內按「← 或 →」判斷方向。
- 題目節奏：
  1. fixation（300ms）
  2. stimulus（150ms，MVP 可配置）
  3. mask/空白（100ms）
  4. 回應視窗（最多 1200ms）
  5. 回饋（對/錯 + 連擊）

### 難度自適應（MVP 必做）

- 先固定空間頻率（例：4 cpd），優先調整「對比」或「傾角差」。
- 用 **2-down-1-up staircase**：
  - 連續 2 題正確 → 難度上升（更低對比 / 更小角度差）
  - 1 題錯誤 → 難度下降
- 每個 block 20 題，共 3 blocks（約 5–8 分鐘）

### 分數與回饋

- 遊戲分數：正確率 + 反應速度 + 連擊。
- 訓練分數（科學向）：
  - block threshold（由 reversal 或最後 N 題估計）
  - session threshold（各 block 加權平均）
- 結算頁顯示：
  - 今天表現 vs 個人 7 日平均
  - 近 14 天趨勢圖

## 4) MVP 功能清單

### 必要功能（Must Have）

1. **訓練畫面**：fixation、刺激呈現、鍵盤作答。
2. **自適應難度引擎**：2-down-1-up + 參數上下限保護。
3. **單次訓練流程**：3 blocks × 20 trials。
4. **結果頁**：正確率、RT、threshold。
5. **本地資料保存**：LocalStorage（先不做雲端帳號）。
6. **基本校準頁**：
   - 螢幕觀看距離提醒
   - 環境亮度提醒
   - 「這不是醫療診斷/治療」聲明

### 可延後（Should/Could）

- 多空間頻率訓練（1.5/3/6/12 cpd）
- 雙眼平衡/遮罩訓練模式
- 每日任務、成就系統
- 雲端同步與排行榜

## 5) 技術實作建議（Web）

- 前端：React + Canvas（或 PixiJS）
- 計時：`performance.now()` 做毫秒級反應時間
- 刺激生成：
  - 預先生成多個對比/方向版本（減少即時運算抖動）
  - 刺激尺寸、sigma、spatial frequency 做統一參數配置
- 資料結構：
  - `session -> block -> trial`
  - trial 記錄：`contrast`, `orientation`, `correct`, `rt_ms`, `staircase_level`

## 6) 風險與防呆

- **醫療風險**：避免療效承諾；文案統一寫「訓練用途，非醫療」。
- **裝置差異**：螢幕亮度、更新率、尺寸會影響刺激一致性。
- **疲勞效應**：連玩過久可能反而降效；MVP 預設每天 1–2 次即可。
- **可用性風險**：太難會流失；因此第一週應偏保守起始難度。

## 7) 兩週衝刺計畫（MVP）

### Week 1

- Day 1–2：刺激渲染 + trial 時序控制
- Day 3：鍵盤輸入與回饋
- Day 4：staircase 引擎
- Day 5：session 結果頁 + LocalStorage

### Week 2

- Day 1：趨勢圖（7/14 天）
- Day 2：校準與聲明頁
- Day 3：參數調校（起始難度/步長/上下限）
- Day 4：5–10 位使用者可用性測試
- Day 5：修正後發佈 v0.1

## 8) 先做這 3 件事（下一步）

1. 我可以先幫你把 **MVP 規格轉成 wireframe（首頁 / 訓練頁 / 結算頁）**。
2. 接著我會做 **可直接開發的資料結構與 API contract（即使先本地）**。
3. 最後再產出 **第一版前端程式骨架**（可立即跑起來）。

---

## 參考資料（研究起點）

- Polat et al., *Improving vision in adult amblyopia by perceptual learning*, PNAS (2004), PubMed: https://pubmed.ncbi.nlm.nih.gov/15096608/
- Zhou et al., *Perceptual learning improves contrast sensitivity and visual acuity in adults with anisometropic amblyopia*, Vision Research (2006), PubMed: https://pubmed.ncbi.nlm.nih.gov/16153674/
- Li et al., *Perceptual learning improves adult amblyopic vision through rule-based cognitive compensation* (2014), PubMed: https://pubmed.ncbi.nlm.nih.gov/24550359/
- Barollo et al., *Perceptual learning improves contrast sensitivity, visual acuity, and foveal crowding in amblyopia* (2017): https://journals.sagepub.com/doi/full/10.3233/RNN-170731

> 註：以上用於產品設計研究參考；若要作為醫療用途，需由眼科/視光專業人員制定 protocol 與審查。
