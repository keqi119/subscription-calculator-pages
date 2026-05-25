# Subscription Calculator Pages

独立的汽车订阅方案测算器静态站点。

## 发布目录

- `public/index.html`: 测算器首页
- `public/calculator.html`: 同首页，保留直接访问路径
- `public/calculator.css`: 页面样式
- `public/calculator.js`: 前端测算逻辑

该仓库只维护方案测算器，不包含电商主页或运营后台文件，避免 Pages 发布时与主站混淆。

## EdgeOne Pages / Vercel

发布目录选择 `public`。

## 当前布局

- 预设参数：采购融资方案、经营效率、成本口径、佣金规则、折旧率表。
- 具体方案：车辆信息、客户付款方案、预计履行期数、每期租金调整。
- 方案结果：核心结果、风控判断、现金流图表、月度明细。

运营利润和收车处置后利润按“具体方案”里的“预计履行期数”计算；“合同平均运行期数”保留为经营效率预设参数，用于估算管理规模。
