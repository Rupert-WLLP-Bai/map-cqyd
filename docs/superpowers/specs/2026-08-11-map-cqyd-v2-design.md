# map-cqyd v2 — 前后端分离 + 1k 建筑 + 1w 线缆 (两江新区)

## 目标
仍是 performative 演示(给领导汇报用),新增 mock 后端模拟真实系统形态,把测试数据扩到 1k 建筑 + 1w 线缆(只在两江新区),处理地图点密度和面板拥挤。

## 架构
单 Node Express 服务,同端口双职责:
- static `/` → index.html, js/, css/
- api `/api/buildings`, `/api/buildings/:id`

数据生成在 boot 时跑一次,内存驻留,无 DB。杀掉 `python3 -m http.server 8000`,只跑 `node server/index.js`。

## 项目结构(新增/改动)

新增:
- `server/package.json` (express 一个依赖)
- `server/index.js` (Express boot + 路由 mount)
- `server/routes/buildings.js` (GET list / detail)
- `server/routes/static.js` (静态托管 index.html / js / css)
- `server/data-generator.js` (两江新区 6 CBD + 5–6 街道 高斯生成)
- `server/lib/rng.js` (mulberry32,从旧 data.js 搬过来)
- `server/smoke.js` (node:test 生成结果自检)
- `js/api.js` (fetch wrapper + 错误转 toast)

改动:
- `js/app.js` — 启动 fetchBuildings,点击 fetchBuilding(id),loading 状态
- `js/map-view.js` — markercluster 集成,签名不变
- `js/floor-panel.js` — 展开后虚拟滚动
- `index.html` — 加 markercluster CDN `<script>` + `<link>`
- `css/styles.css` — markercluster 默认色 + 虚拟滚动容器样式
- `CONTRACT.md` — 移除 canned-only / zero npm 红线,加 API 形状
- `README.md` — 启动方式改 node 命令

删除:
- `js/data.js` (内容搬进 server/data-generator.js + 暴露给前端经 HTTP)

## 数据生成(`server/data-generator.js`)

**bbox**: 经度 106.48–106.72,纬度 29.52–29.74 (两江新区范围)。落出 bbox 的采样丢弃。

**6 CBD(高斯聚集, ~70% / ~700 栋)**:
```
{ name: '江北嘴',   lng: 106.583, lat: 29.575, sigma: 0.012 }
{ name: '光电园',   lng: 106.518, lat: 29.605, sigma: 0.014 }
{ name: '幸福广场', lng: 106.535, lat: 29.585, sigma: 0.010 }
{ name: '观音桥',   lng: 106.575, lat: 29.585, sigma: 0.013 }
{ name: '龙兴',     lng: 106.665, lat: 29.690, sigma: 0.018 }
{ name: '汽博',     lng: 106.555, lat: 29.620, sigma: 0.011 }
```
每个 CBD 用二维高斯采样(lng, lat),σ 控制在 0.010–0.018(约 1–1.5 km 半径)。

**6 主路(带状散布, ~30% / ~300 栋)**:
```
金渝大道 (汽博附近 E-W)
金开大道 (光电园~龙兴 N-S)
渝澳大道 (观音桥往南)
北滨一路 (沿嘉陵江)
机场路   (向江北机场)
龙驿大道 (进龙兴板块)
```
每条主路给一个线段 `(start_lng, start_lat) → (end_lng, end_lat)`,沿 1D 高斯(沿线均匀) + 垂直 2D 高斯(σ ≈ 50–100 m)采样。每条街约 50–60 栋。

**每栋**:
- 4–8 层(uniform)
- 各层线缆数对数正态(ln-Normal):大部分 ~10,少量 50–200 作"设备间"
- 1k 栋 × ~10 平均 ≈ 1w 线缆

**名称**: `${CBD名或路名}-${路}-${号}`,路/号用词库随机。

**线缆字段**(保持现有契约):
```
{ id, name, direction: 'Dong'|'Nan'|'Xi'|'Bei',
  io: 'in'|'out', peer, type, cores }
```

## API

```
GET /api/buildings
  200 [{ id, name, lng, lat, address, floorCount, cableCount }, ...]
  (1k 项,不含 floors/cables 详情)

GET /api/buildings/:id
  200 { ...同上..., floors: [{ floorNo, label, cables: [{... }] }] }
  404 { error: 'not found', id }
```

- 不分页:列表 < 200KB,详情 < 50KB
- 错误统一 JSON,前端 `js/api.js` 统一捕获,顶部显示一行小 banner

## UI 密度处理

**地图**:CDN 加 `leaflet.markercluster@1.5.3`,1k marker 全部入 `L.markerClusterGroup({...})`,聚合圈自动带数字,zoom-in 自动展开。点击单点仍走 `onSelectBuilding(id)`。

**左面板展开**:虚拟滚动,行高 28px 固定,只渲染可见区 + buffer(~30 行代码,不引第三方)。100+ 行性能无感。折叠状态下没变化(只有计数,本来就不显示行)。

## 红线

保留:
1. ❌ NO cables drawn in 3D (只束标记 + 楼层/方向标)
2. ✅ 面板按方向分组折叠
3. ✅ 3D minimal (无飞越/粒子/动画)

**废除**:
4. ❌ ~~canned only / no backend~~
5. ❌ ~~zero npm, zero build step~~

新增:
6. ✅ 1k 建筑全部落在两江新区 bbox
7. ✅ 线缆 schema 不变
8. ✅ mock 后端无数据库,boot 生成,只读

## 明确不做 (out of scope)

- 写 / 编辑 / 删除线缆 — 只读 demo
- 认证 / 授权 — 无
- WebSocket / 实时推送 — 不动
- 持久化 — 进程重启数据重生成(种子固定 → 结果稳定)
- 多语言 — 仍是中文
- 移动端适配 — 仍是笔记本

## 启动方式

```bash
cd /Users/pejoyll/Desktop/code/map-cqyd
npm install          # 装 express(只有一个)
node server/index.js # 启动,打印 "listening on 8000, generated N buildings, M cables"
# 浏览器打开 http://localhost:8000
```

## 自检(`server/smoke.js`,node:test)

- `generateData()` 返回的 buildings 全部落在 bbox
- 数量级:1k ± 5% 栋,1w ± 10% 线缆
- 每栋都有 floors,每层都有 ≥1 cable
- 名称非空,坐标有效,方向 io/ 取值合法