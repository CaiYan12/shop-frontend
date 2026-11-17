# T5 · 素材样本与授权记录（人读版）

> 工单：CaiYan12/shop-frontend#2 · T5
> 机器可读清单：`docs/assets/product-images.json`
> 素材目录：`public/images/products/{slug}/{n}.webp`
> 署名清单：`public/images/products/CREDITS.md`
> 生成时间：2026-11-17

---

## 1. 结论摘要（事实）

| 项 | 值 |
|---|---|
| 商品数 | 5 件（工单要求 4–8 件） |
| 图片数 | 23 张（每件 4–5 张，工单要求每件 ≥4） |
| 商品类型 | 4 类：audio / peripherals / displays / wearables |
| 格式与尺寸 | 全部 WebP，长边 ≤1200px |
| 体积 | 合计 1,016,566 字节（≈993 KB）；单张最大 142,804 字节 |
| 图源 | 全部 Wikimedia Commons，逐文件 CC 许可 |
| 许可 | CC BY-SA 4.0（3 件商品）、CC BY 2.0（2 件商品） |
| 总耗时 | 约 22 分钟（含共享的图源探索） |

---

## 2. 图源路线（事实：试过什么、结果如何）

| 图源 | 尝试方式 | 结果 |
|---|---|---|
| Unsplash 搜索页 | `web_fetch https://unsplash.com/s/photos/sony-wh-1000xm4` | **403**，页面返回「拒绝访问：错误代码 4d1dbaddfcc0f385」 |
| Unsplash 内部 API | `curl https://unsplash.com/napi/search/photos?query=...` | **307 Authorization required** |
| Unsplash 图片 CDN | `curl images.unsplash.com/photo-...?w=400&fm=webp` | 200，可下载、可直接取 WebP（**但无法检索**，拿不到同商品多角度） |
| Pixabay | `web_fetch https://pixabay.com/images/search/headphones/` | **Cloudflare 403**，15 秒内 2 次尝试未通过质询 |
| Pexels | 按工单说明许可页被 Cloudflare 拦截 | 未采用 |
| **Wikimedia Commons** | MediaWiki API（categorymembers + imageinfo/extmetadata） | **可用**：按机型建类，逐文件带 LicenseShortName / Artist / LicenseUrl |

失败原因归纳：Unsplash 与 Pixabay 的**检索入口**被反爬拦截，只有 CDN 直链可用；而 CDN 直链拿不到「同一商品的多角度」——这正是 C58 与 M11 要求的核心，所以这条路不成立。

Commons 的 API 在连续请求时会返回 **429 Too Many Requests**；补上描述性 User-Agent 并每次请求间隔 2 秒后恢复。

---

## 3. 五件商品（事实）

| slug | 商品 | 类型 | 价格档 | 图片数 | 单件耗时 | 许可 |
|---|---|---|---|---|---|---|
| `airpods-max` | Apple AirPods Max | audio 音频设备 | 高 | 5 | 5 分钟 | CC BY-SA 4.0 |
| `keychron-k8` | Keychron K8 | peripherals 键盘外设 | 中 | 5 | 5 分钟 | CC BY 2.0 |
| `dell-e2210f` | Dell E2210f | displays 显示设备 | 低 | 4 | 4 分钟 | CC BY-SA 4.0 |
| `apple-watch-series-8` | Apple Watch Series 8 | wearables 智能穿戴 | 高 | 4 | 4 分钟 | CC BY-SA 4.0 |
| `huawei-watch` | Huawei Watch（第一代） | wearables 智能穿戴 | 中 | 5 | 4 分钟 | CC BY 2.0 |

**耗时口径**：单件耗时 = 该商品素材的检索、视觉核验、下载与转码的墙钟时间；共享的图源探索（约 10 分钟）按 5 件均摊计入。总计约 22 分钟，**没有任何一件触及 30 分钟上限**（C58）。

---

## 4. 每件的图片构成（事实）

### airpods-max — Apple AirPods Max（深空灰）
| # | 内容 | 作者 |
|---|---|---|
| 1 | 黑底 3/4 正面，耳罩与头梁材质 | SimonWaldherr |
| 2 | 俯视平放，双耳罩与头梁全貌 | SimonWaldherr |
| 3 | 支架上 3/4，可见 Digital Crown 与按键 | SimonWaldherr |
| 4 | 支架正面，桌面场景 | SimonWaldherr |
| 5 | 零售包装盒正面 | SimonWaldherr |

同一台深空灰样机、同一位摄影师的连续拍摄（Commons 该类共 13 张）。

### keychron-k8 — Keychron K8（87 键 TKL）
| # | 内容 | 规格标注 |
|---|---|---|
| 1 | 俯视全键盘，原装灰白 PBT 键帽 | 键帽=原装 PBT |
| 2 | 前缘 3/4，可见 USB-C 与系统切换开关 | — |
| 3 | 左上角 esc / F1-F4 特写 | — |
| 4 | 右侧方向键与功能键区特写 | — |
| 5 | 同一键盘换装 Camel 键帽套装 | **键帽=Camel PBT 套装** |

第 5 张是**同一把键盘换键帽**的规格变体图，按「配色图需标注对应规格」标注。

### dell-e2210f — Dell E2210f（22 英寸）
| # | 内容 |
|---|---|
| 1 | 正面 3/4，Dell 标志与底座 |
| 2 | 背面 3/4，支架与 VESA 安装板（第三方升降臂） |
| 3 | 底部接口特写：电源、VGA、DVI |
| 4 | 正背面平视，铭牌与接口 |

### apple-watch-series-8 — Apple Watch Series 8（Nike 款）
| # | 内容 |
|---|---|
| 1 | 表体与包装盒俯视 |
| 2 | 表体与包装盒竖构图 |
| 3 | 表体斜置全貌 |
| 4 | 表盘特写（Nike 表盘） |

同一只午夜色表带 + Nike 表盘的样机（iGeeksBlog 连续拍摄）。**注意**：同类别里 LHY0215 的 45mm 图是**另一只表**（不同表带、不同表盘），已排除。

### huawei-watch — Huawei Watch（第一代，银色 + 黑色真皮表带）
| # | 内容 |
|---|---|
| 1 | 正面 3/4，表盘与真皮表带 |
| 2 | 背面，心率传感器与钢印 |
| 3 | 立于桌面正视 |
| 4 | 正面 3/4，消息通知界面 |
| 5 | 侧面，表体厚度与表冠 |

Maurizio Pesce 的连续拍摄，5 个角度覆盖正/背/侧/立。

---

## 5. 视觉核验（事实：怎么验的）

每张图**下载后都用 `read_image` 逐张看过**，不是只看搜索结果标题。核验要点：

1. **同一件商品**：按外观特征交叉比对（AirPods Max 的深空灰配色与头梁网布、Keychron K8 的红色 ESC 键与灰色铝壳、Dell E2210f 的铭牌与接口布局、Apple Watch 的午夜色表带与 02:24 Nike 表盘、Huawei Watch 的银色表壳与黑色皮表带）。同一类别里出现的**其他样机已剔除**（例如 Apple Watch 的 LHY0215 图、AirPods Pro 的 Pro 2/Pro 3 混拍）。
2. **角度不重复**：正/背/侧/俯视/特写至少覆盖 3 类视角；同一构图的裁切版只保留一张（Apple Watch 的 1、2 是同一构图横竖两版，已记录在案）。
3. **转码后复检**：WebP 生成后再抽查（Apple Watch 4 张全部复看），确认无损坏、无空白。

---

## 6. 授权记录方式（事实）

- **每张图**在 `docs/assets/product-images.json` 里记录：`file`、`sourceUrl`（Commons 文件页，形如 `https://commons.wikimedia.org/wiki/File:...`，实测 200）、`sourceFile`、`license`、`licenseUrl`、`author`、`note`（画面内容）、`spec`（规格标注，无则 null）。
- **署名清单** `public/images/products/CREDITS.md` 随素材一起提交，满足 CC BY / CC BY-SA 的署名义务。
- **许可差异（需要知会）**：工单里已核实的是 Unsplash / Pixabay 的「免费可商用、无需署名」。本次实际使用的是 **CC BY 2.0 与 CC BY-SA 4.0**，两者**都要求署名**，CC BY-SA 还要求改编作品同许可共享（缩放 + 转码属改编）。已按此执行；如果项目要求「零署名义务」，这批图需要换源或补授权说明。
- **未采用的图**：无法确认许可的一律没用；Pexels 未使用。

---

## 7. 可得性结论（事实 + 推论分开）

**事实**：
- 探测了 26 个 Commons 机型类目。
- 其中 **6 个**类目存在「同一摄影师、同一台机器、≥4 张」的连续拍摄：AirPods Max（13 张）、Keychron K8（17 张）、Dell E2210f（5 张）、Apple Watch Series 8（4 张）、Huawei Watch（5 张）、Logitech G910（27 张，但仅 800×531）。
- 另有 5 个类目只有 2–3 张（AirPods Pro 3 张、Apple Watch Series 7 3 张、Sennheiser HD800S 2 张、Google Pixel Watch 2 张、Samsung Galaxy Watch 4 6 张但多为开机画面）。
- 其余类目为 0–1 张或由不同摄影师拍摄不同机器（Logitech MX Master、ThinkVision、Xiaomi Mi Band 等）。

**推论**：
- 按「先猜机型再查类目」的方式，**命中率约 23%（6/26）**。
- 命中率可以通过**先浏览大类目再挑机型**（如 `Category:Mechanical keyboards`、`Category:Headphones` 的子类）提高，但需要额外探测时间。
- 单件耗时在 4–5 分钟，**成本不是瓶颈，命中率才是**。

---

## 8. 最终规模建议（推论与建议）

**建议：16 件（4 类 × 4 件），不直接上 24 件。**

依据：

1. **命中率约束**。要凑 24 件「每件 ≥4 张同商品多角度」，按 23% 命中率需要探测约 100 个类目；实测每个类目一次 API 调用加核验约 1 分钟，仅探测就要 1.5 小时以上，且后半段容易为了凑数放宽标准——这正是 C58 / M11 要避免的。
2. **16 件仍满足题目与规格**。题目要求「不少于 8 个商品」、每页 8 件；16 件 = 每类 4 件 → 2 页，筛选/排序/分页都有足够样本；96 张轮播图降到 64 张。
3. **留出退货余量**。16 件里允许 2–3 件因角度重复或画质不合格被替换，仍能保住 12–16 的底线。
4. **24 件的触发条件**：若第二轮按大类目系统扫描后，能再找到 **≥18 个**「≥4 张同商品」的机型，再上 24 件；否则按 16 件定稿。

---

## 9. 给 T7（种子数据）的输入

- 建议**直接用真实机型名**（Apple AirPods Max、Keychron K8、Dell E2210f、Apple Watch Series 8、Huawei Watch），而不是后端当前的虚构名（如「极光降噪头戴耳机」）。理由：图片是真实产品，用虚构名会产生**图文不符**，正是工单验收项要排除的。
- 每件商品的 `proposedDimensions`（两个规格维度、每维 ≥2 选项）与 `suggestedDemoPrice`（**演示价，非市场价**）已写在 JSON 里，可直接取用或调整。
- 售罄演示建议放在 `dell-e2210f`（`soldOutCandidate: true`）：它是 2010 年前后的机型，标「清仓售罄」合理。
- 价格档位分布：低 1 件、中 2 件、高 2 件，覆盖 C57 要求的多区间。

---

## 10. 遗留问题

1. **署名义务**：CC BY / CC BY-SA 要求署名，与工单里 Unsplash / Pixabay 的「无需署名」不同。若答辩材料不便署名，需另找零署名图源或与老师确认。
2. **Apple Watch 的 1、2 号图是同一构图的横竖两版**，严格说只算 3 个不同视角；如需 4 个完全不同视角，需另找一张同款同色照片替换。
3. **Dell E2210f 与 Huawei Watch 都是老机型**（2010 年代），作为「清仓 / 二手」定位合理，但若要求全系新品，需替换。
4. **未做图片压缩之外的优化**（无响应式多尺寸、无 AVIF）。当前单张最大 142 KB，满足「单张 200 KB 以内」的优化目标。
5. **后端占位 slug 未对齐**：本次按工单要求不迁就后端现有占位商品（aurora-headphones / pulse-earbuds / orbit-watch），T7 需按本清单改种子数据。
