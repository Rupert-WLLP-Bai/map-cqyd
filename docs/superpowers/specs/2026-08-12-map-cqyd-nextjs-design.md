# map-cqyd v4 — Next.js rewrite (项目工程化)

## 目标

把当前 vanilla JS + Express 项目重写成 Next.js (App Router) 全栈, 解决
"工程化"诉求: TypeScript 严格类型 / 组件复用 / 文件路由 / 状态管理
(TanStack Query + Zustand) / shadcn 基础组件。 v3 的全部功能
(Equipment/Room/Footprint/设备过滤面板) 一并照搬, 不退化。

## 决策

| 维度 | 选择 |
|---|---|
| 范围 | 全部换 Next.js; 退役 vanilla + Express |
| 渲染 | App Router + RSC 为主; Leaflet/Three.js 'use client' |
| 数据/状态 | TanStack Query(服务器) + Zustand(UI) |
| 样式 | Tailwind + shadcn/ui |
| 数据层 | 保持 boot 生成 (in-memory, 无 DB) |
| v3 功能 | 全功能照搬 |
| 部署 | 本地 node (next dev / next start); Vercel 不管 |
| TypeScript | 全面 .ts/.tsx, strict mode |

## 项目结构

```
map-cqyd/
├── app/
│   ├── layout.tsx                  # RootLayout + Providers
│   ├── page.tsx                    # 首页 (地图视图, dynamic ssr:false)
│   ├── globals.css                 # Tailwind base + 自定义
│   ├── providers.tsx               # 'use client', QueryClient + 错误边界
│   └── api/
│       └── buildings/
│           ├── route.ts            # GET /api/buildings (list)
│           └── [id]/route.ts       # GET /api/buildings/:id (detail)
├── components/
│   ├── map/
│   │   ├── map-view.tsx            # 'use client', Leaflet + markercluster + GCJ-02
│   │   ├── map-filter.tsx          # 'use client', 设备类型过滤面板
│   │   └── building-popup.tsx      # 'use client', popup 模板
│   ├── building/
│   │   ├── building-page.tsx       # 'use client', 楼宇视图容器
│   │   ├── building-3d.tsx         # 'use client', Three.js
│   │   ├── floor-panel.tsx         # 'use client', equipment 列表 + 过滤
│   │   └── floor-selector.tsx      # 'use client', 楼层下拉
│   ├── view-router.tsx             # 'use client', map/building 切换
│   └── ui/                         # shadcn 基础 (button, card, badge, checkbox)
├── lib/
│   ├── api.ts                      # TanStack Query hooks
│   ├── store.ts                    # Zustand (view, buildingId, floorNo, dir, filter)
│   ├── gcj02.ts                    # WGS-84 → GCJ-02
│   ├── types.ts                    # Building/Floor/Cable/Equipment/Room/Footprint
│   └── api-client.ts               # fetch 封装 + ApiError
├── server/                          # 业务逻辑, 不再走 Express
│   ├── data-generator.ts
│   ├── equipment-generator.ts
│   ├── footprints.json
│   └── rng.ts
├── scripts/
│   └── smoke.mjs                    # node:test 数据校验 (13 项, 沿用 v3)
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── components.json                  # shadcn 配置
├── package.json
├── README.md
├── CONTRACT.md
└── .gitignore
```

## 依赖 (package.json)

deps:
- next ^15
- react ^18, react-dom ^18
- three ^0.160
- leaflet ^1.9, leaflet.markercluster ^1.5
- @tanstack/react-query ^5
- zustand ^4
- tailwindcss ^3, postcss ^8, autoprefixer ^10
- @radix-ui/react-* (shadcn 依赖)
- lucide-react (图标)
- class-variance-authority, clsx, tailwind-merge (shadcn 工具)

devDeps:
- typescript ^5
- @types/react, @types/react-dom, @types/three, @types/leaflet
- eslint, eslint-config-next
- @types/node

## 数据流

```ts
// lib/api-client.ts
export class ApiError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}
export async function fetchBuildings(): Promise<Building[]>;
export async function fetchBuilding(id: string): Promise<Building>;

// lib/api.ts
export function useBuildings() {
  return useQuery({ queryKey: ['buildings'], queryFn: fetchBuildings, staleTime: 5*60_000 });
}
export function useBuilding(id: string | null) {
  return useQuery({
    queryKey: ['building', id],
    queryFn: () => fetchBuilding(id!),
    enabled: !!id,
  });
}

// lib/store.ts (Zustand)
interface ViewStore {
  view: 'map' | 'building';
  buildingId: string | null;
  floorNo: number;
  direction: Direction | null;
  enabledTypes: Set<EquipmentType>;
  enterBuilding: (id: string) => void;
  exitBuilding: () => void;
  setFloor: (n: number) => void;
  setDirection: (d: Direction | null) => void;
  toggleType: (t: EquipmentType) => void;
  setEnabledTypes: (s: Set<EquipmentType>) => void;
}
```

## API 路由

```ts
// app/api/buildings/route.ts
import { NextResponse } from 'next/server';
import { getBuildingsList } from '@/server/data-generator';
import { wgs84ToGcj02 } from '@/lib/gcj02';

export async function GET() {
  const list = getBuildingsList().map((b) => {
    const [lng, lat] = wgs84ToGcj02(b.lng, b.lat);
    return { ...b, lng, lat };
  });
  return NextResponse.json(list);
}
```

GCJ-02 transform 仅在边界对顶层 `lng`/`lat` 生效; `equipment.position`,
`footprint` 等局部 2D 坐标原样透传。

## 客户端组件边界

Leaflet / Three.js 都不能 SSR; 用 `next/dynamic` + `ssr: false`:

```tsx
// app/page.tsx (RSC)
import dynamic from 'next/dynamic';
const MapView = dynamic(
  () => import('@/components/map/map-view').then(m => m.MapView),
  { ssr: false }
);
export default function Page() { return <MapView />; }
```

`building-3d.tsx` 同样处理。

## 数据契约 (继承 v3)

```ts
type Direction = 'Dong' | 'Nan' | 'Xi' | 'Bei';
type EquipmentType = '一级配电箱' | '二级配电箱' | 'OTN' | '光交';
type EquipmentStatus = 'online' | 'offline';
type RoomType = 'main' | 'aux' | 'riser';

interface Cable { id; name; direction: Direction; io: 'in'|'out'; peer; type; cores; }
interface Floor { floorNo; label; cables: Cable[]; }
interface Room { id; buildingId; name; floorNo; type: RoomType; }
interface Equipment {
  id; buildingId;
  type: EquipmentType;
  floorNo; roomId;
  status: EquipmentStatus;
  position: { x: number; y: number };  // [0,1]
}
interface Building {
  id; name; lng; lat; address;
  floorCount; cableCount;
  equipmentTypes: EquipmentType[];
  footprint: Array<[number, number]> | null;  // local 2D polygon
  floors: Floor[];
  rooms: Room[];
  equipment: Equipment[];
}
```

## 视图切换

取代 v1-v3 的 `app.js` + `showMap/showBuilding` 全局函数 + `.view--hidden`
class 切换; 改为 Zustand 驱动的 view router:

```tsx
// components/view-router.tsx
'use client';
export function ViewRouter() {
  const view = useViewStore(s => s.view);
  return view === 'map' ? <MapView /> : <BuildingPage />;
}
```

`app/page.tsx` 只渲染 `<ViewRouter />`。 楼宇视图从 Zustand 取
`buildingId`, 通过 `useBuilding(id)` 取数据。

## 启动

```bash
npm install
npm run dev        # → http://localhost:3000
# 或
npm run build && npm run start
```

## 红线 (继承)

保留:
1. 不画线缆在 3D (只 bundle markers)
2. 面板折叠展开 + 设备列表
3. 3D minimal
4. mock 后端无 DB, boot 生成
5. 两江新区 bbox 约束

新增:
6. 全 TypeScript strict
7. App Router + RSC 为主, Leaflet/Three.js 'use client'
8. shadcn/ui 是组件基础 (不引其他 UI 库)
9. 数据走 TanStack Query, UI 状态走 Zustand

## 明确不做

- SSR / SEO 优化
- 真数据库 / auth / 持久化
- 单元 / E2E 测试 (仅保留 node:test 数据校验)
- 部署 CI/CD / Docker / Vercel
- 国际化 / 移动端适配

## 自检

`scripts/smoke.mjs` (沿用 v3, 13 项):
- bbox 约束 + 数量级 (1k±5%, 1w±10%)
- Equipment/Room/Footprint 字段完整
- Equipment.status 枚举合法
- Equipment.position ∈ [0,1]
- EquipmentTypes 去重且每个 building 至少 1 个 type
- EquipmentTypes 枚举合法

跑: `node --test scripts/smoke.mjs`

## 迁移策略 (big-bang)

ultracode 并行 5 agent:
- **Infra** (package.json / tsconfig / next.config / tailwind / postcss /
  components.json / .gitignore 更新 / app/layout / providers / page / globals)
- **Backend** (server/* TS 移植 / lib/types / lib/gcj02 / lib/api-client /
  app/api/buildings/* / scripts/smoke.mjs)
- **Map** (components/map/* / lib/store / lib/api)
- **Building** (components/building/* / components/view-router)
- **UI** (components/ui/* shadcn 原语)

之后顺序:
- **Migration** (删 js/ + server/index.js + server/routes/, npm install,
  next dev, 浏览器验证)

每个 agent 独立 commit (用 `git add <specific-files>`, 不用 -A 避免 race)。