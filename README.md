# 高真实感 3D 樱花树（模型版 · 艺术家 GLB + 动态花瓣）

基于 Three.js r131 的浏览器实时 3D 樱花树。**树干/树枝/花簇使用外部艺术家制作的成熟 3D 模型**（Sketchfab 免费模型，PBR 贴图），在此之上叠加动态飘落花瓣、电影级黄昏光照与完整交互。

## 运行（重要）

模型文件（`models/cherry_blossom_trees.glb`）必须通过 **HTTP 服务器** 加载，直接双击 HTML 会被浏览器安全策略拦截。

方式一（推荐，Python）：
```
cd E:\樱花树\sakura-3d
python -m http.server 8080
```
浏览器打开 http://localhost:8080/

方式二（Node）：
```
cd E:\樱花树\sakura-3d
npx serve .
```
浏览器打开 http://localhost:3000/

> 说明：打开后若看到"请通过本地服务器打开"提示层，说明你正用 file:// 直接打开——请改用上面的命令。
> 首次打开需联网加载 Three.js CDN 脚本。

## 目录

```
sakura-3d/
├── index.html               # 模型版入口（UI / 脚本链 / file:// 引导）
├── index-programmatic.html  # 旧程序化生成版（备份，可对比）
├── js/model-main.js         # 模型版引擎（GLB 加载 / 光照 / 花瓣 / 交互）
├── js/petal-b64.js          # 飘落花瓣纹理（PNG 内联）
├── models/cherry_blossom_trees.glb  # 樱花树模型（Sketchfab · Jagobo · CC Attribution）
├── models/grass_lawn.glb    # 真实草坪模型（曾接入，用户要求去掉草地后不再加载，留档）
├── models/tree_sakura.glb   # 旧模型备份（Tree Sakura · RosticOstafi）
├── package.json
└── README.md
```

## 模型来源与许可

- 模型：**Cherry Blossom Trees**（3D Model by Jagobo，Sketchfab）
- 许可：**CC Attribution**（允许商用，需署名作者 Jagobo）
- 数据：3 棵树组合包——主树（大树，**77.8k 三角形 / 56k 顶点**）+ 背景树（GLB 内两棵小树克隆出 **6 棵**，按目标世界高 5.5–7.5 直接缩放，环绕主树后方扇形分布）；树皮 PBR 全套（color/normal/roughness 1024² 贴图）；花簇黑底粉花 RGBA 贴图（已启用 alpha 裁剪）
- 下载地址：https://sketchfab.com/3d-models/cherry-blossom-trees-f69be55d2e4f4f73b568ebb185bd8496
- 署名建议（页面/项目内）：`Cherry Blossom Trees by Jagobo is licensed under CC BY`

> 旧模型 Tree Sakura（RosticOstafi，38k 三角形）已保留在 `models/` 供对比回退，默认加载 Jagobo 版。

> 草坪模型 GrassLawn（Sketchfab · CC BY）曾接入（材质已转标准 PBR，见 `_convert_grass.py`），后按用户要求**去掉草地**——地面改为深棕土地圆盘，背景改由 6 棵樱花树填充。GLB 留档于 `models/` 不再加载。

## 模型版功能

- **真实树形**：艺术家建模的粗壮主干、自然分枝、粉紫花簇（非程序化拼接）
- **背景树群**：6 棵克隆樱花树环绕主树后方（高度 5.5–7.5、距离 8.5–14 错落），拉开场景层次
- **飘落花瓣**：InstancedMesh 粒子，独立下落速度 / 水平漂移 / 旋转 / 升降；数量可调（0–2000）；五瓣樱花贴图（花蕊+高光，非雪花）；**落地后在地面堆积停留数秒**（微风吹拂滑动、淡出重生），冬季雪落地停留更久
- **地面**：程序化泥土贴图圆盘 + 海岸浅滩 + 520 片贴地落叶 + 150 朵粉白小花（环绕所有树）
- **海洋背景**：岛屿式环境——土地外围 420 世界单位海面（波浪纹理流动动画 + 太阳反光 + 海岸浅滩），远处海面与天空雾融
- **时间模式**：白天（太阳+蓝天白云+明媚光）/ 夜晚（月亮+星空+月光蓝调），0.9s 平滑过渡
- **四季更替**：春（粉花）/ 夏（绿叶+绿飘叶）/ 秋（橙红叶+红叶飘落）/ 冬（雪白树冠+六瓣雪花飘落），树冠 foliage 染色 + 飘落物贴图联动
- **天气系统**（上海多变式）：晴 / 阴 / 雨 / 风 / 雷暴——云层密度与明暗、雨线粒子（斜向、随风倾斜）、雷暴闪电闪光（随机脉冲）、光线衰减（阴雨变暗、晴天明亮）、阴雨时太阳被云遮住
- **蓝天白云**：深蓝天顶→浅蓝地平线渐变 + 白色棉花云，雾色浅蓝白且拉远（树区清晰、远海雾融），曝光提升，去雾霾感
- **花簇随风摆动**：主树 + 背景树 foliage 节点错相位摇曳，幅度随风力联动
- **电影光照**：低角度暖橙主光（逆光轮廓）+ 半球天光 + 暖色补光；ACES 色调映射；PCF 柔和阴影
- **交互**：左键旋转 / 滚轮缩放 / 右键平移；全景 / 中景 / 近景一键切换（按模型尺寸动态计算）；动画开关 / 全屏 / 重置；加载进度显示
- **性能**：像素比上限 2、后台自动降帧、模型包围盒归一化、实例化花瓣/落叶/雨线

## 部署到静态网站

模型版是纯静态站点（无构建步骤），可整体上传到任意静态托管：

- **GitHub Pages / Cloudflare Pages / Netlify**：把 `sakura-3d/` 整个目录（含 `models/`）作为站点根目录上传，访问站点根路径即可。
- **Nginx / 其他服务器**：把目录放到 web 根，确保 `models/*.glb` 可被访问（默认 MIME 已支持 GLB）。

## 后续规划（记忆树）

- 每条记忆 = 一片叶子/花瓣 + 照片 + 故事，点击花瓣弹出记忆卡片
- 第一版先存本地（localStorage / IndexedDB），后续可同步云端
- 小狗角色驻树底（参考图元素）

## 旧程序化版

`index-programmatic.html` 为 v9 程序化生成版（此前交付），保留供对比回退。
