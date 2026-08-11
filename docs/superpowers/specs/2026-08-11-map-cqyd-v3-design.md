# map-cqyd v3 — Equipment / 机房 first-class + 建筑形状 + 地图类型过滤

## 目标
在 v2 (1k 建筑 / 10k 线缆 / mock 后端 / markercluster) 基础上,把"楼内内容"从
"线缆清单"升级为"设备 + 机房"为主角;支持建筑异形(手工 polygon 钩子);
并在地图侧加一个设备类型过滤面板。

## 实体模型升级

```
Equipment = {
  id, buildingId,
  type: '一级配电箱' | '二级配电箱' | 'OTN' | '光交',
  floorNo, roomId,
  status: 'online' | 'offline',
  position: { x, y }       // 楼层内局部坐标, 0..1
}
Room = {
  id, buildingId, name,
  floorNo,
  type: 'main' | 'aux' | 'riser'   // 主设备间 / 辅助间 / 弱电井
}
Cable 仍生成,但 v3 完全不渲染(为 v4 拓扑图留底)。
Building 增 footprint?: [[x, y], ...] | null   // 局部坐标多边形顶点
```

## 项目结构(新增/改动)

新增:
- `server/data/footprints.json` — 手工 polygon 清单(~10 栋特殊形状建筑)
- `server/data/equipment-generator.js` — Room + Equipment 生成
- `js/map-filter.js` — 地图左侧设备类型过滤面板 (DOM + 状态)

改动:
- `server/data-generator.js` — 接入 equipment-generator;累加 `building.equipmentTypes`
- `server/routes/buildings.js` — 列表接口加 `equipmentTypes`;详情接口加 `rooms + equipment + footprint`
- `js/api.js` — Building 类型扩展(`rooms?`, `equipment?`, `footprint?`, `equipmentTypes?`)
- `js/map-view.js` — 接收并挂载过滤面板;实现 marker add/remove
- `js/building3d.js` — polygon footprint 拉伸 + 设备点(仅当前层)
- `js/floor-panel.js` — `dir-group` → `eq-group`,Equipment 行渲染 + 过滤
- `js/building-view.js` — 面板替换为 equipment 列表
- `css/styles.css` — 过滤面板 + eq-group 样式
- `index.html` — 过滤面板 mount 点(在 #map-view 内)
- `CONTRACT.md` — 更新数据契约 + API 字段
- `README.md` — 提一句 Equipment 模型

## 数据生成

### Room (每栋楼)
- 1F 必有 1 个 `main`(主设备间,命名: "主设备间" / "B栋机房" / "进线间" 等)
- 3F+ 偶有 1 个 `aux`(辅助设备间)
- 跨楼层建筑可有 1~2 个 `riser`(弱电井,贯通楼层的纵向设备)

### Equipment (每栋楼)
- **一级配电箱**: 1 个 / 楼,在 `main` 房
- **二级配电箱**: 1~3 个 / 层,在本层任意 room
- **OTN**: 0~1 个 / 楼(稀,光传送网)
- **光交**: 0~2 个 / 层(光纤交接)
- **status**: 80% online / 20% offline(留可见离线样本)
- **position**: 局部 0..1 随机,楼层内均匀分布

### Building.equipmentTypes
生成器在生成完 Equipment 后,对该 building 累加去重所有 type,作为列表
返回(`building.equipmentTypes: string[]`)。这是过滤面板每个 type 后面那
个数字的来源——**该 type 覆盖了多少栋建筑**,不是多少台设备。

## 建筑形状(footprint)

`server/data/footprints.json` 格式:
```json
{
  "BLD-0064": { "polygon": [[1.0, 0.5], [-1.0, 0.5], [-1.0, -0.5], [0.0, 0], [1.0, -0.5]] },
  "BLD-0231": { "polygon": [[1.0, 0.5], [-1.0, 0.5], [-1.0, -0.3], [-0.4, -0.3], [-0.4, -0.5], [1.0, -0.5]] }
}
```
约 10 栋手工标"特殊形状"(工字 / L / T),其余默认 `null` → 渲染为
BoxGeometry (矩形 slab)。

3D 渲染逻辑:
```js
if (building.footprint) {
  const shape = new THREE.Shape();
  shape.moveTo(...footprint[0]);
  for (const [x, y] of footprint.slice(1)) shape.lineTo(x, y);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: SLAB_H, bevelEnabled: false });
  // 沿 Y 方向排列楼板,同 v2 stack 逻辑
} else {
  // 原 BoxGeometry
}
```

## API

```
GET /api/buildings
  -> 200 [{
    id, name, lng, lat, address,
    floorCount, cableCount,
    equipmentTypes: ['一级配电箱', '二级配电箱', ...]   // 该建筑含有的设备类型(去重)
  }, ...]

GET /api/buildings/:id
  -> 200 {
    ...同上...,
    footprint: [[x, y], ...] | null,
    rooms: [{ id, name, floorNo, type }],
    equipment: [{ id, type, floorNo, roomId, status, position: {x,y} }, ...]
  }
  -> 404 { error: 'not found', id }
```

## UI:地图左侧过滤面板

**位置**:浮卡,贴地图左上(zoom 控件上方),180px 宽,白底 + 阴影。

**DOM 草稿**:
```html
<div class="map-filter">
  <div class="map-filter__title">设备类型筛选</div>
  <label class="map-filter__row">
    <input type="checkbox" data-type="一级配电箱" checked />
    <span class="map-filter__name">一级配电箱</span>
    <span class="map-filter__count">1000</span>
  </label>
  ... 4 行 ...
  <div class="map-filter__actions">
    <button data-action="all">全选</button>
    <button data-action="none">清空</button>
  </div>
</div>
```

**逻辑**:
- 默认全选(全部显示)
- 取消勾选某 type → 从 cluster group 移除**所有不含任何剩余勾选类型**的建筑的 marker
- 重新勾选 → 加回这些 marker
- cluster 自动重算 (markercluster `removeLayers` / `addLayers` API)
- count: 每 type 显示该 type 覆盖的建筑数(静态,不变)

**OR 语义**(用户已确认):建筑只要含**任一勾选类型**就显示。

## UI:楼内面板 (Equipment 替换 Cable)

**每层只展示 一级配电箱 + 二级配电箱**(OTN/光交 v3 面板不展示,只在 3D)。

**同层平铺 + 顶部 type 过滤条**:
```
┌─ 楼层 1F ────────────────────┐
│ 类型: [全部] [一级] [二级]   │
│ ☐ 仅异常 (online→offline)  │
│                             │
│ ┌─ 设备 ───────────────────┐ │
│ │ [一级] 一级配电箱-001    │ │
│ │  主设备间 ●online        │ │
│ ├──────────────────────────┤ │
│ │ [二级] 二级配电箱-014    │ │
│ │  主设备间 ○offline       │ │
│ └──────────────────────────┘ │
└─────────────────────────────┘
```

**行字段**:
- type badge(色块)
- name
- room name
- status(绿/红小点 + 文字)

## UI:3D 设备点(当前楼层)

- 当前楼层所有 Equipment 画微小色块在楼板上
- 位置:position {x, y} 局部 → 转换为世界坐标(乘 SLAB_W/2, SLAB_D/2)
- 配色:**一级配电箱=绿 / 二级配电箱=蓝 / OTN=黄 / 光交=紫**
- 切换楼层:旧层点隐去,新层点显出
- Bundle markers(线缆统计)**保留**(Cable 数据还在,3D 用 count 即可)
- 设备点 + 束标记 = 信息叠加(线缆量 + 设备位置)

## 红线

**保留**:
1. 不画线缆在 3D(只统计)
2. 面板折叠展开(改为 eq-group)
3. 3D minimal (无飞越/粒子/动画)
4. mock 后端无数据库

**新增**:
5. Equipment + Room 是 first-class entity
6. Cable 在 v3 完全不渲染(数据生成,前端不显示)
7. Building footprint 可选 polygon,默认矩形
8. 设备点仅当前楼层
9. 过滤面板 OR 语义,默认全选

## 明确不做 (out of scope)

- Cable 拓扑图(v4)
- Equipment CRUD / 在线状态编辑
- 设备图片 / 型号图标
- 多语言 / 移动端
- 持久化 / 认证

## 启动

`node server/index.js` (不变,只更新数据契约)

## 自检 (`server/smoke.js`,在 v2 7 项基础上加)

- 每栋 building.equipmentTypes 非空(至少 1 个 type)
- building.equipmentTypes 中所有 type 都是合法枚举
- 每栋 building.equipment 至少 1 个一级配电箱
- 详情接口含 rooms + equipment + footprint 字段
- 所有 Equipment.status ∈ {online, offline}
- 所有 Equipment.position.x/y ∈ [0, 1]