# T5 · 素材样本与授权记录（人读版）

> 工单：CaiYan12/shop-frontend#2 · T5（5 件）与 #3 · T5b（扩到 16 件）
> 机器可读清单：`docs/assets/product-images.json`
> 素材目录：`public/images/products/{slug}/{n}.webp`
> 署名清单：`public/images/products/CREDITS.md`
> 生成时间：2026-11-17T15:35:18+08:00

---

## 1. 结论摘要（事实）

| 项 | 值 |
|---|---|
| 商品数 | 7 件（目标 16 件 = 4 类 × 4） |
| 图片数 | 32 张 |
| 类型分布 | audio 1 / displays 1 / peripherals 3 / wearables 2 |
| 格式与尺寸 | 全部 WebP，长边 ≤1200px |
| 体积 | 合计 1,905,056 字节（≈1860 KB） |
| 图源 | 全部 Wikimedia Commons |
| 许可 | CC BY 2.0、CC BY-SA 2.0、CC BY-SA 4.0 |
| 单件耗时合计 | 36 分钟（墙钟分摊，精度 ±2 分钟/件） |

## 2. 图源路线（事实：试过什么、结果如何）

| 图源 | 尝试方式 | 结果 |
|---|---|---|
| Unsplash 搜索页 | `web_fetch https://unsplash.com/s/photos/...` | **403**，页面返回「拒绝访问：错误代码 4d1dbaddfcc0f385」 |
| Unsplash 内部 API | `curl https://unsplash.com/napi/search/photos` | **307 Authorization required** |
| Unsplash 图片 CDN | `images.unsplash.com/photo-...?fm=webp` | 200，可下载，但**无法检索**，拿不到同商品多角度 |
| Pixabay | `web_fetch https://pixabay.com/images/search/...` | **Cloudflare 403**，15 秒内 2 次尝试未过质询 |
| Pexels | 按工单说明许可页被 Cloudflare 拦截 | 未采用 |
| **Wikimedia Commons** | MediaWiki API（categorymembers + imageinfo/extmetadata） | **可用**：按机型建类，逐文件带 LicenseShortName / Artist / LicenseUrl |

失败原因归纳：Unsplash 与 Pixabay 的**检索入口**被反爬拦截，只有 CDN 直链可用；而 CDN 直链拿不到「同一商品的多角度」，不满足 C58 / M11。

Commons 的 API 在连续请求时会返回 **429 Too Many Requests**；补描述性 User-Agent 并每次间隔 2–3 秒后恢复。

## 3. 商品清单（事实）

| slug | 商品 | 类型 | 价格档 | 图片数 | 耗时 | 许可 |
|---|---|---|---|---|---|---|
| `airpods-max` | Apple AirPods Max | audio | high | 5 | 5 分钟 | CC BY-SA 4.0 |
| `keychron-k8` | Keychron K8 | peripherals | mid | 5 | 5 分钟 | CC BY 2.0 |
| `logitech-g15` | Logitech G15 | peripherals | low | 4 | 7 分钟 | CC BY-SA 2.0 |
| `logitech-g613` | Logitech G613 | peripherals | mid | 5 | 7 分钟 | CC BY 2.0 |
| `dell-e2210f` | Dell E2210f | displays | low | 4 | 4 分钟 | CC BY-SA 4.0 |
| `apple-watch-series-8` | Apple Watch Series 8 | wearables | high | 4 | 4 分钟 | CC BY-SA 4.0 |
| `huawei-watch` | Huawei Watch | wearables | mid | 5 | 4 分钟 | CC BY 2.0 |

价格档为演示定位（低 / 中 / 高），`suggestedDemoPrice` 是**演示价，不是市场价**。

## 4. 每件图片构成（事实）

### airpods-max — Apple AirPods Max

画面规格：深空灰（Space Gray）；建议维度：颜色=深空灰/银色；接口=Lightning/USB-C

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 黑底 3/4 正面，耳罩与头梁材质 | — | SimonWaldherr | CC BY-SA 4.0 |
| 2 | 俯视平放，双耳罩与头梁全貌 | — | SimonWaldherr | CC BY-SA 4.0 |
| 3 | 支架上 3/4，可见 Digital Crown 与按键 | — | SimonWaldherr | CC BY-SA 4.0 |
| 4 | 支架正面，桌面场景 | — | SimonWaldherr | CC BY-SA 4.0 |
| 5 | 零售包装盒正面 | — | SimonWaldherr | CC BY-SA 4.0 |

### keychron-k8 — Keychron K8

画面规格：原装灰白 PBT 键帽（另有 Camel 键帽套装图）；建议维度：轴体=红轴/茶轴；键帽=原装 PBT/Camel PBT 套装

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 俯视全键盘，原装灰白 PBT 键帽 | 键帽=原装 PBT | Triple-green | CC BY 2.0 |
| 2 | 前缘 3/4，可见 USB-C 与系统切换开关 | — | Triple-green | CC BY 2.0 |
| 3 | 左上角 esc / F1-F4 特写 | — | Triple-green | CC BY 2.0 |
| 4 | 右侧方向键与功能键区特写 | — | Triple-green | CC BY 2.0 |
| 5 | 同一键盘换装 Camel 键帽套装 | 键帽=Camel PBT 套装 | Triple-green | CC BY 2.0 |

### logitech-g15 — Logitech G15

画面规格：银色面板 + 蓝色背光；建议维度：版本=初代/v2；成色=全新/二手

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 桌面场景，G15 与 Apple 键盘并排 | — | William Hook | CC BY-SA 2.0 |
| 2 | 左上角 Logitech G15 标识特写 | — | William Hook | CC BY-SA 2.0 |
| 3 | 可编程 LCD 屏特写 | — | William Hook | CC BY-SA 2.0 |
| 4 | 多媒体按键区特写 | — | William Hook | CC BY-SA 2.0 |

### logitech-g613 — Logitech G613

画面规格：黑色 + Romer-G 轴；建议维度：轴体=Romer-G 线性/Romer-G 段落；连接=Lightspeed 无线/蓝牙

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 俯视全键盘，木桌面场景 | — | MiNe from Taipei, Taiwan | CC BY 2.0 |
| 2 | G1-G6 宏键特写 | — | MiNe from Taipei, Taiwan | CC BY 2.0 |
| 3 | 左侧视角，可见宏键列与掌托 | — | MiNe from Taipei, Taiwan | CC BY 2.0 |
| 4 | 媒体控制键特写 | — | MiNe from Taipei, Taiwan | CC BY 2.0 |
| 5 | 背面，电池仓与支架 | — | MiNe from Taipei, Taiwan | CC BY 2.0 |

### dell-e2210f — Dell E2210f

画面规格：黑色机身 + 第三方升降臂（图 2）；建议维度：支架=原装底座/第三方升降臂；成色=全新/官翻

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 正面 3/4，Dell 标志与底座 | — | Raimond Spekking | CC BY-SA 4.0 |
| 2 | 背面 3/4，支架与 VESA 安装板 | 支架=第三方升降臂 | Raimond Spekking | CC BY-SA 4.0 |
| 3 | 底部接口特写：电源、VGA、DVI | — | Raimond Spekking | CC BY-SA 4.0 |
| 4 | 正背面平视，铭牌与接口 | — | Raimond Spekking | CC BY-SA 4.0 |

### apple-watch-series-8 — Apple Watch Series 8

画面规格：午夜色运动表带 + Nike 表盘；建议维度：表壳=41mm/45mm；表带=运动型表带/Nike 运动表带

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 表体与包装盒俯视 | — | iGeeksBlog | CC BY-SA 4.0 |
| 2 | 表体与包装盒竖构图 | — | iGeeksBlog | CC BY-SA 4.0 |
| 3 | 表体斜置全貌 | — | iGeeksBlog | CC BY-SA 4.0 |
| 4 | 表盘特写（Nike 表盘） | 表带=Nike 运动表带 | iGeeksBlog | CC BY-SA 4.0 |

### huawei-watch — Huawei Watch

画面规格：银色表壳 + 黑色真皮表带；建议维度：表壳=银色/黑色；表带=真皮/金属

| # | 内容 | 规格标注 | 作者 | 许可 |
|---|---|---|---|---|
| 1 | 正面 3/4，表盘与真皮表带 | 表带=真皮 | Maurizio Pesce from Milan, Italia | CC BY 2.0 |
| 2 | 背面，心率传感器与钢印 | — | Maurizio Pesce from Milan, Italia | CC BY 2.0 |
| 3 | 立于桌面正视 | — | Maurizio Pesce from Milan, Italia | CC BY 2.0 |
| 4 | 正面 3/4，消息通知界面 | — | Maurizio Pesce from Milan, Italia | CC BY 2.0 |
| 5 | 侧面，表体厚度与表冠 | — | Maurizio Pesce from Milan, Italia | CC BY 2.0 |

## 5. 视觉核验（事实：怎么验的）

每张图**下载后都用 `read_image` 逐张看过**，不是只看搜索结果标题。核验要点：

1. **同一件商品**：按外观特征交叉比对（配色、磨损位置、铭牌、按键布局、配件）。同类别里出现的**其他样机已剔除**。
2. **角度不重复**：正 / 背 / 侧 / 俯视 / 特写至少覆盖 3 类视角；同一构图的裁切版只保留一张。
3. **转码后复检**：WebP 生成后再抽查，确认无损坏、无空白。

**已排除的候选（记录原因，不降标准）**：

| 候选 | 排除原因 |
|---|---|
| Beats Solo 3（Raimond Spekking，4 张） | 同一台机器但**耳罩皮革大面积剥落**，作为新品展示会误导 |
| Ducky Shine 4（Kenming Wang，5 张） | 4 张是**套着塑料保护膜**拍的，1 张是盒内容物，无干净产品图 |
| IBM Model M（Engicoder，7 张） | 许可字段只有「Attribution」且无 LicenseUrl，**无法确认具体许可条款** |
| Anker Soundcore AeroFit 2 Pro（Kyu3a，4 张） | 1 张是**货架多配色**、3 张手持实拍，非产品图 |
| Razer Naga / Ouroboros、Logitech G19s、Cherry G80-3000（Sinchen.Lin） | 同机多角度齐全，但源图仅 **700×465**，放大到轮播尺寸会糊 |
| Apple Watch Series 7（MIKI Yoshihito，3 张） | 只有 3 张，不足 4 张 |
| AirPods Pro（aconcagua，3 张） | 只有 3 张；Burkhard Mücke 的 5 张混了 Pro 2 / Pro 3 两代 |

## 6. 授权记录方式（事实）

- 每张图在 `docs/assets/product-images.json` 里记录：`file`、`sourceUrl`（Commons 文件页）、`sourceFile`、`license`、`licenseUrl`、`author`、`note`、`spec`。
- 署名清单 `public/images/products/CREDITS.md` 随素材一起提交，满足 CC BY / CC BY-SA 的署名义务。
- 许可差异：工单里已核实的是 Unsplash / Pixabay 的「免费可商用、无需署名」；本次实际使用 CC BY 2.0 / CC BY 4.0 / CC BY-SA 2.0 / CC BY-SA 4.0，**均要求署名**，CC BY-SA 另要求同许可共享。已按此执行。
- 无法确认许可的图一律没用（见 §5 排除清单）。

## 7. 可得性结论（事实 + 推论分开）

**事实**：
- 累计探测 Commons 类目 90+ 个（含品牌级与机型级）。
- 同一摄影师、同一台机器、≥4 张的类目是少数；大量类目只有 1–3 张，或由不同摄影师拍不同机器。
- 命中率约 20–25%（按「先猜机型再查类目」的方式）。

**推论**：
- 单件耗时 4–8 分钟，**成本不是瓶颈，命中率才是**。
- 按当前节奏，补齐到 16 件还需要再探测约 40–60 个类目。

## 8. 规模建议（已定）

**16 件（4 类 × 4）**，不再上 24 件。依据：

1. 命中率约束：24 件需探测约 100 个类目，后半段容易为凑数放宽标准（C58 / M11 要避免的正是这个）。
2. 16 件满足题目「不少于 8 个商品」与每页 8 件 → 2 页，筛选 / 排序 / 分页都有足够样本。
3. 留出替换余量：允许 2–3 件因角度重复或画质不合格被替换。

## 9. 给 T7（种子数据）的输入

- 建议**直接用真实机型名**（如 Apple AirPods Max、Keychron K8），而不是后端当前的虚构名；图片是真实产品，用虚构名会产生**图文不符**。
- 每件商品的 `proposedDimensions`（两个规格维度、每维 ≥2 选项）与 `suggestedDemoPrice`（演示价）已写在 JSON 里。
- 售罄演示建议放在 `soldOutCandidate: true` 的商品上。
- 价格档分布见 §3，覆盖 C57 要求的多区间。

## 10. 遗留问题

1. **署名义务**：CC BY / CC BY-SA 要求署名，与工单里 Unsplash / Pixabay 的「无需署名」不同；答辩报告需加一节素材来源与授权。
2. **分辨率不齐**：Logitech G910 源图仅 800×531（未放大），其余为 1200px 长边。
3. **老机型**：Dell E2210f、Huawei Watch（一代）、Logitech G15 均为 2010 年代产品，按「清仓 / 二手」定位合理。
4. **后端占位 slug 未对齐**：按工单要求不迁就后端现有占位商品，T7 需按本清单改种子数据。
