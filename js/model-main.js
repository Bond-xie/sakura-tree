/* ============================================================
   高真实感 3D 樱花树 — 模型版引擎 (Model Edition)
   加载外部艺术家制作的 GLB 樱花树模型 + 动态飘落花瓣
   模型来源: Sketchfab "Tree Sakura" by RosticOstafi (CC Attribution)
   Three.js r131 (UMD) · GLTFLoader · InstancedMesh
   ============================================================ */
(function () {
  'use strict';

  /* cannon.js 物理引擎：本地内联加载（部分环境下外部 <script src> 会静默加载失败）
     同步 XHR 读本地文件 → script.textContent 内联执行（已验证在该环境 100% 成功） */
  (function () {
    if (typeof CANNON !== 'undefined') return;
    try {
      var _xhr = new XMLHttpRequest();
      _xhr.open('GET', 'js/cannon.min.js?t=' + Date.now(), false); // 时间戳防 304
      _xhr.send();
      var _ok = (_xhr.status === 200 || _xhr.status === 304) && _xhr.responseText.indexOf('CANNON') > -1;
      console.log('[cannon-loader] status=' + _xhr.status + ' len=' + _xhr.responseText.length + ' ok=' + _ok);
      if (_ok) {
        var _s = document.createElement('script');
        _s.textContent = _xhr.responseText;
        document.head.appendChild(_s);
        console.log('[cannon-loader] injected CANNON=' + (typeof CANNON));
      }
    } catch (e) { console.warn('[cannon-loader] FAIL ' + e.message); }
  })();

  let scene, camera, renderer, controls, composer;
  let clock = new THREE.Clock();
  let animating = true;
  let windStrength = 1.0;
  let flying = null;
  let petalSystem = null;
  let treeRoot = null;          // 加载的模型组
  let treeModel = null;         // 归一到树高 ~TREE_H 后的容器（主树）
  let modelBox = null;          // 归一化前模型包围盒
  let groundDetailGroup = null; // 地面细节（落叶/草/花）容器
  let groundMesh = null;        // 地面圆盘（季节切换颜色）
  let backgroundTrees = [];     // 背景小树
  let petalTexCache = null;     // 花瓣纹理单例（空中+地面落叶+小花共享）
  let foliageSwayers = [];      // 花簇风吹摆动器（主树 + 背景树 foliage 节点）
  let currentTimeMode = 'day';  // 时间模式：day / night
  let timeLerp = null;          // 时间模式平滑过渡（from/to/t/dur）
  let currentSeason = 'spring'; // 季节：spring / summer / autumn / winter
  let currentWeather = 'clear'; // 天气：clear / cloudy / rain
  let rainSystem = null;        // 雨线粒子
  let dustField = null;         // 空气微尘/花粉粒子（白天阳光里漂浮）
  let cloudGroup = null;        // 云层 Sprite 组
  let cloudSprites = [];        // 云 Sprite 列表
  let lightningState = { flash: 0, timer: 0 }; // 已停用（雷暴天气移除）
  let seaMesh = null, seaMat = null, shoreMesh = null;  // 海洋（程序化着色器海面 + 浪涌岸环）
  let audioCtx = null, ambientStarted = false, birdTimer = null;
  let foliageMatList = [];      // 树冠 foliage 材质（季节染色用，去重）
  let seasonTexCache = {};      // 季节飘落物贴图缓存
  let physicsWorld = null;      // cannon.js 物理世界（花瓣/叶/雪）
  let petalBodies = [];         // 每片飘落物对应物理刚体（池化常驻）
  let groundBody = null;        // 地面静态碰撞体

  // 季节物理：重力系数（花瓣/叶/雪的优雅慢飘）、质量（叶更重）
  const SEASON_GRAVITY = { spring: 6.0, summer: 6.6, autumn: 6.2, winter: 3.4 };
  const SEASON_MASS   = { spring: 0.018, summer: 0.03, autumn: 0.026, winter: 0.01 };

  // 灯光引用（白天/夜晚预设切换用）
  let keyLight = null, hemiLight = null, ambientLight = null, groundFillLight = null, rimLight = null;
  let skyMesh = null;
  let skyUniforms = null, skyLerp = null;   // 天空 shader 色板与过渡
  let groundBaseColor = null;                // 地面季节基色（天气湿暗在上面叠乘）
  const GROUND_WET = { clear: 1.0, cloudy: 0.86, wind: 0.97, rain: 0.34 };
  let sunMesh = null, moonMesh = null, starField = null, celestialGroup = null;

  const QUALITY = (window.innerWidth < 768) ? 'low' : 'high';
  const MAX_PETALS = 2000;
  const DEFAULT_PETALS = 620;   // 树冠需要足够密度才"有花"，同时控制飘落节奏

  // 归一化目标：树的总高度(含树冠)归一为 TREE_H 单位（单棵大树，突出主体）
  const TREE_H = 14.0;

  /* ============================================================
     工具
     ============================================================ */
  // Canvas 贴图统一标 sRGB：渲染器 outputEncoding=sRGB，贴图不标会被当成线性空间 → 颜色被拉白（天空发灰白就是这个原因）
  function mkTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function makeSkyTexture(mode) {
    // 纯垂直渐变，不带任何随机云（云用 3D 云团代替）
    // 这样球面 u=0/u=1 处颜色完全一致，不会有左右拼接缝
    const c = document.createElement('canvas'); c.width = 4; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    if (mode === 'night') {
      grad.addColorStop(0.0, '#0d1326');
      grad.addColorStop(0.30, '#1c2340');
      grad.addColorStop(0.55, '#2c3357');
      grad.addColorStop(0.78, '#3d4368');
      grad.addColorStop(1.0, '#4a4f74');
    } else {
      grad.addColorStop(0.0, '#1566d2');
      grad.addColorStop(0.16, '#2f86e0');
      grad.addColorStop(0.38, '#68aef0');
      grad.addColorStop(0.62, '#a6d2f6');
      grad.addColorStop(0.82, '#d6edfc');
      grad.addColorStop(1.0, '#f0f8ff');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 512);
    return mkTex(c);
  }

  // 云：真正的 3D 云团 —— 每朵云由 9~13 个"软球"堆出来，
  // 球面用自定义 shader 做边缘虚化（正对视线不透明、侧缘透明），叠在一起才有体积，
  // 不再是几张贴图糊在天空上（那种一看就是贴纸）
  function makePuffMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0.8 }
      },
      vertexShader: [
        'varying vec3 vN;',
        'varying vec3 vV;',
        'varying vec3 vNW;',
        'void main () {',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vN = normalize(normalMatrix * normal);',
        '  vV = normalize(-mv.xyz);',
        '  vNW = normalize((modelMatrix * vec4(normal, 0.0)).xyz);',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'uniform float uOpacity;',
        'varying vec3 vN;',
        'varying vec3 vV;',
        'varying vec3 vNW;',
        'void main () {',
        '  float d = abs(dot(normalize(vN), normalize(vV)));',
        '  float a = smoothstep(0.04, 0.64, d);',
        // 上亮下暗：云底有阴影才不像一团死白
        '  float up = clamp(vNW.y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(uColor * 0.55, uColor * 1.05, up);',
        '  gl_FragColor = vec4(col, a * uOpacity);',
        '  #include <encodings_fragment>',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
  }

  // 球体顶点做低频正弦起伏：每团云外形都不一样，避免看出是标准球
  const puffGeoCache = {};
  function makePuffGeo(seed) {
    if (puffGeoCache[seed]) return puffGeoCache[seed];
    const g = new THREE.SphereGeometry(1, 16, 11);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const s = 1 + 0.15 * Math.sin(v.x * 2.7 + seed * 1.3)
                  + 0.11 * Math.sin(v.y * 3.4 + seed * 2.1)
                  + 0.09 * Math.sin(v.z * 2.2 + seed * 3.7);
      v.multiplyScalar(s);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    puffGeoCache[seed] = g;
    return g;
  }

  function buildClouds() {
    cloudGroup = new THREE.Group();
    const CLOUD_N = 12;
    for (let i = 0; i < CLOUD_N; i++) {
      const grp = new THREE.Group();
      const mat = makePuffMaterial();
      const puffs = 7 + (Math.random() * 4 | 0);
      for (let k = 0; k < puffs; k++) {
        const geo = makePuffGeo((i * 7 + k * 3) % 11);
        const m = new THREE.Mesh(geo, mat);
        const u = (puffs > 1 ? (k / (puffs - 1)) * 2 - 1 : 0);
        const taper = 0.42 + 0.58 * Math.cos(u * Math.PI * 0.5);
        const r = (0.9 + Math.random() * 0.5) * taper;
        m.position.set(
          u * 2.8 + (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7 + (1 - taper) * 0.3,
          (Math.random() - 0.5) * 1.3
        );
        m.scale.set(r * (1.3 + Math.random() * 0.3), r * (0.6 + Math.random() * 0.15), r * (1.0 + Math.random() * 0.2));
        grp.add(m);
      }
      const baseAng = Math.random() * Math.PI * 2;
      const rr = 80 + Math.random() * 60;
      grp.position.set(Math.cos(baseAng) * rr, 32 + Math.random() * 18, Math.sin(baseAng) * rr);
      const baseScale = 3.5 + Math.random() * 2.5;
      grp.scale.setScalar(baseScale);
      grp.userData = {
        ang: baseAng, rr: rr, spd: 0.003 + Math.random() * 0.005,
        phase: Math.random() * Math.PI * 2, baseScale: baseScale, mat: mat
      };
      cloudGroup.add(grp);
      cloudSprites.push(grp);
    }
    scene.add(cloudGroup);
    applyClouds(currentWeather);
  }

  // 按天气调整云层：晴=少且白亮（中远分散，蓝天白云）、阴/雨=多且灰、雷暴=多且黑
  function applyClouds(weather) {
    const cfg = {
      clear:  { vis: 9,  color: '#f4f8ff', opacity: 1.0 },
      cloudy: { vis: 18, color: '#7c8794', opacity: 1.0 },
      wind:   { vis: 12, color: '#e2e8f1', opacity: 1.0 },
      rain:   { vis: 20, color: '#39414b', opacity: 0.86 }
    }[weather] || { vis: 9, color: '#f4f8ff', opacity: 1.0 };
    cloudSprites.forEach(function (grp, i) {
      grp.visible = i < cfg.vis;
      const night = (currentTimeMode === 'night');
      const u = grp.userData.mat && grp.userData.mat.uniforms;
      if (!u) return;
      const col = new THREE.Color(cfg.color);
      // 夜里云的白色必须压到几乎看不见：shader 末尾要过 sRGB 编码，0.14 这种值
      // 经过编码后仍然是一团亮灰，会挂在天上发白，所以这里直接压到 0.05 以下
      if (night) col.multiplyScalar(0.045);
      u.uColor.value.copy(col);
      u.uOpacity.value = 0.34 * (night ? 0.10 : 1);
    });
  }

  function updateClouds(dt) {
    if (!cloudGroup) return;
    const t = clock.getElapsedTime();
    cloudSprites.forEach(function (grp) {
      const u = grp.userData;
      u.ang += u.spd * dt * (1 + windStrength * 0.4);
      grp.position.x = Math.cos(u.ang) * u.rr;
      grp.position.z = Math.sin(u.ang) * u.rr;
      // 呼吸（云团缓慢涨缩）+ 极慢自转（云的形状慢慢变形，不是一张图在飘）
      const br = 1 + Math.sin(t * 0.25 + u.phase) * 0.07;
      grp.scale.setScalar(u.baseScale * br);
      grp.rotation.y += dt * 0.02;
    });
  }

  function makePetalTexture() {
    // 单片樱花瓣（落樱真实形态：飘落的是一片花瓣，不是整朵花）
    // 竖向长椭圆 + 顶端 V 形缺刻 + 底端收成细柄尖；硬边轮廓，边缘不再渐隐
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    const cxp = 64, top = 10, bot = 120, hw = 33;
    const notchW = hw * 0.30, notchD = 21;   // 顶端缺刻半宽 / 深度
    g.beginPath();
    g.moveTo(cxp, bot);
    g.bezierCurveTo(cxp - hw * 0.96, bot - hw * 0.85, cxp - hw * 1.04, top + hw * 0.95, cxp - notchW, top + notchD);
    g.lineTo(cxp, top + notchD - 4);                 // V 缺口底
    g.lineTo(cxp + notchW, top + notchD);
    g.bezierCurveTo(cxp + hw * 1.04, top + hw * 0.95, cxp + hw * 0.96, bot - hw * 0.85, cxp, bot);
    g.closePath();
    // 瓣尖深粉 → 瓣中粉 → 瓣根淡粉白（线性，纵向）
    const grad = g.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, 'rgba(226,124,163,1)');
    grad.addColorStop(0.28, 'rgba(243,168,196,1)');
    grad.addColorStop(0.62, 'rgba(250,203,218,1)');
    grad.addColorStop(1, 'rgba(252,228,236,1)');
    g.fillStyle = grad;
    g.fill();
    // 硬描边（花瓣薄片边缘）
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(198,116,150,0.55)';
    g.stroke();
    // 中央主脉 + 两侧淡脉
    g.lineWidth = 1.6;
    g.strokeStyle = 'rgba(226,150,178,0.42)';
    g.beginPath(); g.moveTo(cxp, bot - 8); g.lineTo(cxp, top + notchD + 8); g.stroke();
    g.lineWidth = 1.1;
    g.strokeStyle = 'rgba(230,158,184,0.26)';
    [-1, 1].forEach(function (sgn) {
      for (let i = 1; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cxp, bot - 16 - i * 16);
        g.quadraticCurveTo(cxp + sgn * hw * (0.30 + i * 0.10), bot - 26 - i * 16, cxp + sgn * hw * (0.50 + i * 0.10), bot - 34 - i * 16);
        g.stroke();
      }
    });
    const t = new THREE.Texture(c);
    t.needsUpdate = true;
    return t;
  }

  function realPetalTex() {
    return makePetalTexture(); // 统一使用五瓣樱花贴图
  }

  // 花瓣纹理单例：空中飘落花瓣 / 地面落叶 / 地面小花共用同一张贴图
  function getPetalTexture() {
    if (!petalTexCache) petalTexCache = realPetalTex();
    return petalTexCache;
  }

  // 中心集中随机（花瓣/草/落叶主要落在树冠附近，外围稀疏）
  function centeredRand() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  /* ============================================================
     初始化
     ============================================================ */
  function init() {
    const container = document.getElementById('canvas-container');

    // 渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY === 'low' ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // 场景
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(TIME_MODES.day.fogColor, TIME_MODES.day.fogNear, TIME_MODES.day.fogFar);

    // 相机
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(17, 9, 20);

    // 控制器
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, TREE_H * 0.45, 0);
    controls.minDistance = 3.5;
    controls.maxDistance = 45;
    // 防穿模：禁止完全俯视/仰视穿过地面（极角限制在 10°~84°，海面以下不可达）
    controls.minPolarAngle = 0.18;
    controls.maxPolarAngle = Math.PI * 0.47;

    // 背景天空 + 光照 + 地面 + 海洋 + 花瓣
    buildSky();
    buildLights();
    buildGround();
    buildSea();
    buildRain();
    buildPhysics();   // cannon.js 物理世界（花瓣/叶/雪），CDN 失败自动降级

    // 加载 GLB 模型
    loadTreeModel();

    // 花瓣（延迟到模型加载后再播种范围）
    buildPetals();

    // 事件
    window.addEventListener('resize', onResize);
    // 浏览器自动播放策略：首次点击/触摸页面后再启动环境音
    const startAudioOnce = function () {
      initAmbientAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      window.removeEventListener('pointerdown', startAudioOnce);
      window.removeEventListener('click', startAudioOnce);
    };
    window.addEventListener('pointerdown', startAudioOnce);
    window.addEventListener('click', startAudioOnce);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clock.getDelta(); // 后台时清空累计 delta
    });

    setupUI();
  }

  /* ============================================================
     背景天空（极简，只作光照环境）
     ============================================================ */
  // 天空色板：按 昼夜 × 天气 给出 天顶/中段/地平线 三色 + 地平线雾感
  // 直接给 ShaderMaterial 上色，切换时插值过渡，不再重建 canvas 贴图（重建纹理是切天气卡顿的来源之一）
  const SKY_PRESETS = {
    'day|clear':   { top: '#1566d2', mid: '#68aef0', bot: '#f0f8ff', haze: 0.35 },
    'day|cloudy':  { top: '#4a6d94', mid: '#7d97ad', bot: '#c8d3dc', haze: 0.6 },
    'day|wind':    { top: '#2f7ac8', mid: '#86b8e8', bot: '#dceaf5', haze: 0.45 },
    'day|rain':    { top: '#333d49', mid: '#47525f', bot: '#5b6673', haze: 0.52 },
    'night|clear': { top: '#0d1326', mid: '#2c3357', bot: '#4a4f74', haze: 0.2 },
    'night|cloudy':{ top: '#141a27', mid: '#252b3a', bot: '#343b4b', haze: 0.5 },
    'night|wind':  { top: '#111830', mid: '#28304c', bot: '#3d4463', haze: 0.3 },
    'night|rain':  { top: '#080b10', mid: '#12171e', bot: '#1d232b', haze: 0.7 }
  };

  function skrgb(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  function skyPreset(weather, mode) {
    return SKY_PRESETS[(mode || currentTimeMode) + '|' + (weather || currentWeather)]
        || SKY_PRESETS['day|clear'];
  }

  // 目标色 → 0.9s 内插值过去
  function setSkyTarget(instant) {
    if (!skyUniforms) return;
    const p = skyPreset(currentWeather, currentTimeMode);
    skyLerp = skyLerp || {
      top: skyUniforms.uTop.value.clone(),
      mid: skyUniforms.uMid.value.clone(),
      bot: skyUniforms.uBot.value.clone(),
      haze: skyUniforms.uHaze.value,
      t: 1, dur: 0.9
    };
    skyLerp.from = {
      top: skyUniforms.uTop.value.clone(),
      mid: skyUniforms.uMid.value.clone(),
      bot: skyUniforms.uBot.value.clone(),
      haze: skyUniforms.uHaze.value
    };
    skyLerp.to = { top: skrgb(p.top), mid: skrgb(p.mid), bot: skrgb(p.bot), haze: p.haze };
    skyLerp.t = instant ? skyLerp.dur : 0;
  }

  function updateSky(dt) {
    if (!skyLerp || !skyUniforms) return;
    if (skyLerp.t >= skyLerp.dur) return;
    skyLerp.t += dt;
    const k = Math.min(skyLerp.t / skyLerp.dur, 1);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const f = skyLerp.from, t2 = skyLerp.to;
    skyUniforms.uTop.value.copy(f.top).lerp(t2.top, e);
    skyUniforms.uMid.value.copy(f.mid).lerp(t2.mid, e);
    skyUniforms.uBot.value.copy(f.bot).lerp(t2.bot, e);
    skyUniforms.uHaze.value = f.haze + (t2.haze - f.haze) * e;
  }

  function buildSky() {
    const skyGeo = new THREE.SphereGeometry(60, 64, 32);
    const p0 = skyPreset(currentWeather, currentTimeMode);
    skyUniforms = {
      uTop:  { value: skrgb(p0.top) },
      uMid:  { value: skrgb(p0.mid) },
      uBot:  { value: skrgb(p0.bot) },
      uHaze: { value: p0.haze }
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      vertexShader: [
        'varying vec3 vDir;',
        'void main () {',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uTop;',
        'uniform vec3 uMid;',
        'uniform vec3 uBot;',
        'uniform float uHaze;',
        'varying vec3 vDir;',
        'vec3 enc (vec3 c) {',
        '  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0035), c));',
        '}',
        'void main () {',
        '  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 c = mix(uBot, uMid, smoothstep(0.02, 0.34, h));',
        '  c = mix(c, uTop, smoothstep(0.28, 0.94, h));',
        // 地平线一圈雾霭，雨天更重（天贴着海，上下要连成一片灰）
        '  c = mix(c, mix(uBot, vec3(0.82, 0.86, 0.9), 0.35), (1.0 - smoothstep(0.0, 0.18, h)) * uHaze * 0.7);',
        '  gl_FragColor = vec4(enc(c), 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false
    });
    skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.renderOrder = -1;
    scene.add(skyMesh);

    // 云层（天气控制数量与明暗）
    buildClouds();

    // 太阳 / 月亮 / 星星（时间模式切换显示）
    buildCelestial();
  }

  /* ============================================================
     太阳 / 月亮 / 星星：Sprite 贴在天球内侧，随白天/夜晚切换
     ============================================================ */
  function makeSunTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 2, 128, 128, 124);
    grad.addColorStop(0.00, 'rgba(255,253,242,1)');
    grad.addColorStop(0.18, 'rgba(255,248,226,1)');
    grad.addColorStop(0.24, 'rgba(255,240,200,0.92)');
    grad.addColorStop(0.42, 'rgba(255,226,166,0.38)');
    grad.addColorStop(0.70, 'rgba(255,216,146,0.12)');
    grad.addColorStop(1.00, 'rgba(255,210,140,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return mkTex(c);
  }

  function makeMoonTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    // 光晕
    const halo = g.createRadialGradient(128, 128, 8, 128, 128, 118);
    halo.addColorStop(0, 'rgba(240,246,255,0.95)');
    halo.addColorStop(0.32, 'rgba(214,228,255,0.42)');
    halo.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 256, 256);
    // 月轮（带明暗，非纯白圆）
    const moon = g.createRadialGradient(116, 116, 4, 124, 120, 40);
    moon.addColorStop(0, '#ffffff');
    moon.addColorStop(0.7, '#eef2ff');
    moon.addColorStop(1, '#d8e0f5');
    g.fillStyle = moon;
    g.beginPath(); g.arc(120, 116, 38, 0, Math.PI * 2); g.fill();
    // 少量月面阴影
    g.fillStyle = 'rgba(180,190,220,0.5)';
    g.beginPath(); g.arc(106, 104, 10, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(136, 128, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(118, 138, 5, 0, Math.PI * 2); g.fill();
    return mkTex(c);
  }

  function makeStarTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    for (let i = 0; i < 620; i++) {
      const x = Math.random() * 512, y = Math.random() * 512;
      const s = 0.6 + Math.random() * 1.6;
      const a = 0.3 + Math.random() * 0.65;
      g.fillStyle = 'rgba(255,255,255,' + a + ')';
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    return mkTex(c);
  }

  function buildStarfield() {
    // 真星空：800 颗粒子均匀分布上半球（大小/亮度参差，像真星星）
    const N = 800;
    const pos = new Float32Array(N * 3);
    const sizes = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random());   // 上半球 0~90°
      const r = 55 + Math.random() * 35;
      pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      pos[i * 3 + 1] = Math.cos(phi) * r * 0.92;
      pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
      sizes[i] = 0.35 + Math.pow(Math.random(), 3) * 1.4; // 大部分小，少数亮星
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.7, transparent: true, opacity: 0.7,
      sizeAttenuation: true, depthWrite: false, fog: false, toneMapped: false
    });
    starField = new THREE.Points(geo, mat);
    starField.position.set(0, 10, 0);
    scene.add(starField);
  }

  function updateStars(t) {
    if (!starField) return;
    // 夜晚轻微闪烁（整体呼吸，不刺眼）
    if (starField.visible) {
      starField.material.opacity = 0.55 + Math.sin(t * 0.45) * 0.13;
    }
  }

  // 空气微尘/花粉：阳光里缓慢漂浮的细小光点，夜晚压暗
  function makeDotTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    return mkTex(c);
  }

  function buildDust() {
    const N = QUALITY === 'low' ? 70 : 130;
    const pos = new Float32Array(N * 3);
    const base = [];
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 18;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = 0.6 + Math.random() * 7.5;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      base.push({ x: x, y: y, z: z, ph: Math.random() * Math.PI * 2, sp: 0.2 + Math.random() * 0.5 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: makeDotTexture(), color: 0xfff2d8, size: 0.14, transparent: true, opacity: 0.5,
      sizeAttenuation: true, depthWrite: false, fog: true
    });
    dustField = new THREE.Points(geo, mat);
    dustField.userData.base = base;
    scene.add(dustField);
  }

  function updateDust(dt, t) {
    if (!dustField) return;
    const attr = dustField.geometry.attributes.position;
    const base = dustField.userData.base;
    for (let i = 0; i < base.length; i++) {
      const b = base[i];
      attr.array[i * 3] = b.x + Math.sin(t * b.sp + b.ph) * 0.6;
      attr.array[i * 3 + 1] = b.y + Math.sin(t * b.sp * 0.7 + b.ph * 1.3) * 0.35;
      attr.array[i * 3 + 2] = b.z + Math.cos(t * b.sp * 0.8 + b.ph) * 0.6;
    }
    attr.needsUpdate = true;
    const night = currentTimeMode === 'night' ? 1 : 0;
    dustField.material.opacity = 0.5 * (1 - night) + 0.12 * night;
  }

  function buildCelestial() {
    // 太阳：白天显示（toneMapped:false 保持高亮，fog:false 不被雾遮挡，蓝天中清晰可见）
    sunMesh = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeSunTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false
    }));
    // 月亮：夜晚显示
    moonMesh = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeMoonTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false
    }));
    // 星空：Points 粒子（替换旧整张贴片，夜晚细小微弱星光）
    buildStarfield();
    buildDust();
    // 太阳/月亮是 Sprite（永远面向相机），挂在 celestialGroup 里，位置固定在世界远处
    celestialGroup = new THREE.Group();
    scene.add(celestialGroup);
    celestialGroup.add(sunMesh); celestialGroup.add(moonMesh);
    updateCelestial();
  }

  function updateCelestial() {
    // 太阳/月亮放在世界坐标的远处（距原点约 120，远超相机最大 45 的轨道），转到最大视角也够不到它背后
    // 太阳抬高、往左挪，避开主树树冠 —— 既始终看得见，又不会"盖"在树上
    sunMesh.position.set(-56, 32, -74);
    sunMesh.scale.setScalar(26);
    moonMesh.position.set(-46, 31, -72);
    moonMesh.scale.setScalar(18);
    // 切换显隐
    const isDay = currentTimeMode === 'day';
    const heavy = (currentWeather === 'rain');
    sunMesh.visible = isDay && !heavy;
    sunMesh.material.opacity = (currentWeather === 'cloudy' || currentWeather === 'wind') ? 0.42 : 1.0;
    moonMesh.visible = !isDay && !heavy;
    moonMesh.material.opacity = (currentWeather === 'cloudy' || currentWeather === 'wind') ? 0.55 : 1.0;
    if (starField) starField.visible = !isDay && !heavy;
  }

  /* ============================================================
     真实时间驱动：按本地钟点/日期自动切昼夜与季节，
     太阳沿东升西落轨道移动、月亮在对侧
     ============================================================ */
  let realtimeMode = false;
  function applyRealtimeNow() {
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    // 季节按月自动
    const month = d.getMonth() + 1;
    let season = 'spring';
    if (month >= 3 && month <= 5) season = 'spring';
    else if (month >= 6 && month <= 8) season = 'summer';
    else if (month >= 9 && month <= 11) season = 'autumn';
    else season = 'winter';
    if (season !== currentSeason) applySeason(season);
    // 昼夜：6:00-18:59 白天
    const isDay = h >= 6 && h < 19;
    const mode = isDay ? 'day' : 'night';
    if (mode !== currentTimeMode) applyTimeMode(mode);
    // 太阳沿东升西落轨道（6:00 东 → 12:30 天顶 → 19:00 西），月亮在对侧
    const prog = Math.max(0, Math.min(1, (h - 6) / 13));
    const ang = Math.PI * 0.15 + prog * Math.PI * 1.7;
    const elev = Math.sin(prog * Math.PI);
    if (sunMesh) {
      const sv = new THREE.Vector3(Math.cos(ang), 0.06 + elev * 0.32, Math.sin(ang)).normalize().multiplyScalar(105);
      sunMesh.position.copy(sv);
      sunMesh.scale.setScalar(24 + elev * 6);
      sunMesh.material.opacity = (currentWeather === 'cloudy' || currentWeather === 'wind') ? 0.42 : 1.0;
    }
    if (moonMesh) {
      const mv = new THREE.Vector3(Math.cos(ang + Math.PI), 0.08 + (1 - elev) * 0.28, Math.sin(ang + Math.PI)).normalize().multiplyScalar(105);
      moonMesh.position.copy(mv);
      moonMesh.scale.setScalar(18);
      moonMesh.material.opacity = (currentWeather === 'cloudy' || currentWeather === 'wind') ? 0.55 : 1.0;
    }
  }
  function updateRealtime(dt) {
    if (realtimeMode) applyRealtimeNow();
  }

  /* ============================================================
     光照（可切换白天/夜晚：day 明媚、night 月光蓝调）
     ============================================================ */
  function buildLights() {
    // 主光：白暖高光（逆光侧），白天强、夜晚转为月光蓝
    keyLight = new THREE.DirectionalLight(0xfff2dc, 1.55);
    keyLight.position.set(-7, 4.5, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(QUALITY === 'low' ? 1024 : 2048, QUALITY === 'low' ? 1024 : 2048);
    keyLight.shadow.radius = 4;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 45;
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0008;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    // 天光补光（暗部可读）
    hemiLight = new THREE.HemisphereLight(0xeaf4ff, 0x9a8d82, 0.7);
    scene.add(hemiLight);

    // 冷色地面补光
    groundFillLight = new THREE.DirectionalLight(0xd8f0e8, 0.35);
    groundFillLight.position.set(4, 6, -4);
    scene.add(groundFillLight);

    // 环境光微补
    ambientLight = new THREE.AmbientLight(0xfff4f0, 0.24);
    scene.add(ambientLight);

    // 暖色轮廓光（树冠另一侧，增强体积感）
    rimLight = new THREE.DirectionalLight(0xffd0e0, 0.45);
    rimLight.position.set(6, 5, -8);
    scene.add(rimLight);
  }

  /* ============================================================
     时间模式：白天 / 夜晚光照预设
     ============================================================ */
  const TIME_MODES = {
    day: {
      keyColor: 0xfff2dc, keyIntensity: 1.55,
      hemiSky: 0xdceeff, hemiGround: 0x9a8d82, hemiIntensity: 0.72,
      ambientColor: 0xfff4f0, ambientIntensity: 0.26,
      groundFillColor: 0xd8f0e8, groundFillIntensity: 0.38,
      rimColor: 0xffd0e0, rimIntensity: 0.5,
      exposure: 1.12,
      fogColor: 0xcfe2f5, fogNear: 42, fogFar: 180
    },
    night: {
      keyColor: 0xaec4ff, keyIntensity: 1.35,
      hemiSky: 0x323d5e, hemiGround: 0x1a1420, hemiIntensity: 0.55,
      ambientColor: 0x455080, ambientIntensity: 0.55,
      groundFillColor: 0x3a4868, groundFillIntensity: 0.38,
      rimColor: 0x9fb4ff, rimIntensity: 0.45,
      exposure: 1.06,
      fogColor: 0x1a2540, fogNear: 40, fogFar: 150
    }
  };

  /* ============================================================
     季节预设：树冠染色 + 飘落物 + 背景色调
     ============================================================ */
  const SEASONS = {
    spring: { foliageTint: new THREE.Color(1.22, 0.78, 0.90),     petalTint: new THREE.Color(0.92, 0.56, 0.70),  label: '春' },
    summer: { foliageTint: new THREE.Color(0.55, 0.78, 0.42), petalTint: new THREE.Color(0.62, 0.85, 0.45), label: '夏' },
    autumn: { foliageTint: new THREE.Color(1.06, 0.74, 0.42), petalTint: new THREE.Color(0.98, 0.52, 0.26),  label: '秋' },
    winter: { foliageTint: new THREE.Color(1.12, 1.18, 1.32), petalTint: new THREE.Color(1, 1, 1),          label: '冬' }
  };

  // 季节飘落物贴图：春=五瓣粉樱 / 夏=绿叶 / 秋=红叶 / 冬=六瓣雪花
  function makeLeafTexture(colorTop, colorMid) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    const cx = 64, top = 12, bot = 116, hw = 23;
    // 真叶形：细长、两端收尖、叶缘带细锯齿。以前是"径向渐变到透明"的软椭圆，
    // 远看就是一片橙光斑，糊在树冠上特别假 —— 这里改成有硬边轮廓的叶子
    g.beginPath();
    g.moveTo(cx, top);
    g.bezierCurveTo(cx + hw * 0.62, top + 22, cx + hw, 56, cx + hw * 0.72, 84);
    g.bezierCurveTo(cx + hw * 0.34, 103, cx + 3, bot - 4, cx, bot);
    g.bezierCurveTo(cx - 3, bot - 4, cx - hw * 0.34, 103, cx - hw * 0.72, 84);
    g.bezierCurveTo(cx - hw, 56, cx - hw * 0.62, top + 22, cx, top);
    g.closePath();
    const grad = g.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, colorTop);
    grad.addColorStop(0.55, colorMid);
    grad.addColorStop(1, colorTop);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(70,44,24,.55)';
    g.lineWidth = 2.0;
    g.stroke();
    // 主脉：从叶柄到叶尖，两头收细
    g.strokeStyle = 'rgba(255,246,230,.5)';
    g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(cx, bot - 3); g.lineTo(cx, top + 6); g.stroke();
    // 五对侧脉：越靠叶尖越短
    g.strokeStyle = 'rgba(255,246,230,.34)';
    g.lineWidth = 1.5;
    for (let i = 1; i <= 5; i++) {
      const yy = top + 16 + (bot - top - 24) * (i / 6.2);
      const ww = hw * (1 - i / 7.4) * 0.82;
      g.beginPath(); g.moveTo(cx, yy); g.lineTo(cx + ww, yy - 9); g.stroke();
      g.beginPath(); g.moveTo(cx, yy); g.lineTo(cx - ww, yy - 9); g.stroke();
    }
    // 叶柄
    g.strokeStyle = 'rgba(96,62,36,.6)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, bot); g.lineTo(cx, bot + 8); g.stroke();
    const t = new THREE.Texture(c);
    t.needsUpdate = true;
    return t;
  }

  function makeSnowTexture() {
    // 六瓣雪花（细枝 + 主枝），白色半透明
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    const cx = 64, cy = 64;
    g.translate(cx, cy);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(0, -24);
      g.stroke();
      // 分支
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(0, -12); g.lineTo(-7, -18);
      g.moveTo(0, -12); g.lineTo(7, -18);
      g.moveTo(0, -19); g.lineTo(-5, -23);
      g.moveTo(0, -19); g.lineTo(5, -23);
      g.stroke();
      g.lineWidth = 2.2;
      // 中心点
      g.beginPath(); g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.Texture(c);
    t.needsUpdate = true;
    return t;
  }

  function getSeasonTexture(season) {
    if (!seasonTexCache[season]) {
      if (season === 'summer') seasonTexCache.summer = makeLeafTexture('rgba(120,190,80,1)', 'rgba(90,160,60,1)');
      else if (season === 'autumn') seasonTexCache.autumn = makeLeafTexture('rgba(235,140,60,1)', 'rgba(210,110,45,1)');
      else if (season === 'winter') seasonTexCache.winter = makeSnowTexture();
      else seasonTexCache.spring = makePetalTexture();
    }
    return seasonTexCache[season];
  }

  // 计算当前完整光照目标 = 昼夜预设 × 天气光衰减
  // 天气对雾的额外压制：阴天拉近一点、雨天直接起雾幕，把远处海和岛压进灰里
  const WEATHER_FOG = {
    clear:  { near: 1.0,  far: 1.0,  color: null,      mix: 0.0 },
    cloudy: { near: 0.82, far: 0.80, color: '#b9c4cf', mix: 0.34 },
    wind:   { near: 0.95, far: 0.95, color: '#d2dee8', mix: 0.16 },
    rain:   { near: 0.36, far: 0.50, color: '#5d6772', mix: 0.86 }
  };

  // 天气对曝光的额外系数：雨天整体压暗，阴天略降
  const WEATHER_EXPO = { clear: 1.0, cloudy: 0.94, wind: 0.97, rain: 0.66 };

  function getLightTarget() {
    const b = TIME_MODES[currentTimeMode];
    const dim = WEATHER_DIM[currentWeather] || 1.0;
    const wf = WEATHER_FOG[currentWeather] || WEATHER_FOG.clear;
    let fogColor = new THREE.Color(b.fogColor).convertSRGBToLinear();
    if (wf.color) {
      const night = (currentTimeMode === 'night');
      // 雾色也按 sRGB → 线性 转一次，否则渲染器再把线性值编码成 sRGB 时会整体偏白
      const c = new THREE.Color(wf.color).convertSRGBToLinear();
      if (night) c.multiplyScalar(0.18);
      fogColor.lerp(c, wf.mix);
    }
    const night = (currentTimeMode === 'night');
    return {
      keyColor: b.keyColor, keyIntensity: b.keyIntensity * (night ? dim : dim * 0.92),
      hemiSky: b.hemiSky, hemiGround: b.hemiGround, hemiIntensity: b.hemiIntensity * dim,
      ambientColor: b.ambientColor, ambientIntensity: b.ambientIntensity * dim,
      groundFillColor: b.groundFillColor, groundFillIntensity: b.groundFillIntensity * dim,
      rimColor: b.rimColor, rimIntensity: b.rimIntensity * dim,
      exposure: b.exposure * (WEATHER_EXPO[currentWeather] || 1.0),
      fogColor: fogColor,
      fogNear: b.fogNear * wf.near,
      fogFar: b.fogFar * wf.far
    };
  }

  function startLightLerp() {
    const to = getLightTarget();
    const from = timeLerp ? timeLerp.to : to;
    timeLerp = { from: from, to: to, t: 0, dur: 0.60 };
  }

  function applyTimeMode(mode) {
    if (mode !== 'day' && mode !== 'night') return;
    currentTimeMode = mode;
    startLightLerp();
    setSkyTarget();
    // 按钮高亮立即切换
    document.querySelectorAll('[data-time]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.time === mode);
    });
    // 天体显隐立即切换（过渡结束后换天空贴图）
    updateCelestial();
    // 云随昼夜一起压暗/提亮
    applyClouds(currentWeather);
  }

  // 时间模式插值过渡（每帧由 animate 调用；天空贴图在过渡结束后切换）
  function updateTimeLerp(dt) {
    if (!timeLerp) return;
    timeLerp.t += dt;
    const k = Math.min(timeLerp.t / timeLerp.dur, 1);
    // easeInOutQuad
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const f = timeLerp.from, t2 = timeLerp.to;
    if (keyLight) { keyLight.intensity = f.keyIntensity + (t2.keyIntensity - f.keyIntensity) * e; keyLight.color.copy(new THREE.Color(f.keyColor).lerp(new THREE.Color(t2.keyColor), e)); }
    if (hemiLight) {
      hemiLight.intensity = f.hemiIntensity + (t2.hemiIntensity - f.hemiIntensity) * e;
      hemiLight.color.copy(new THREE.Color(f.hemiSky).lerp(new THREE.Color(t2.hemiSky), e));
      hemiLight.groundColor.copy(new THREE.Color(f.hemiGround).lerp(new THREE.Color(t2.hemiGround), e));
    }
    if (ambientLight) { ambientLight.intensity = f.ambientIntensity + (t2.ambientIntensity - f.ambientIntensity) * e; ambientLight.color.copy(new THREE.Color(f.ambientColor).lerp(new THREE.Color(t2.ambientColor), e)); }
    if (groundFillLight) { groundFillLight.intensity = f.groundFillIntensity + (t2.groundFillIntensity - f.groundFillIntensity) * e; groundFillLight.color.copy(new THREE.Color(f.groundFillColor).lerp(new THREE.Color(t2.groundFillColor), e)); }
    if (rimLight) { rimLight.intensity = f.rimIntensity + (t2.rimIntensity - f.rimIntensity) * e; rimLight.color.copy(new THREE.Color(f.rimColor).lerp(new THREE.Color(t2.rimColor), e)); }
    renderer.toneMappingExposure = f.exposure + (t2.exposure - f.exposure) * e;
    scene.fog.color.copy(new THREE.Color(f.fogColor).lerp(new THREE.Color(t2.fogColor), e));
    scene.fog.near = f.fogNear + (t2.fogNear - f.fogNear) * e;
    scene.fog.far = f.fogFar + (t2.fogFar - f.fogFar) * e;
    // 天空已改成 shader 色板插值（updateSky 负责），这里只管结束标志
    if (k >= 1) {
      timeLerp = null;
    }
  }

  /* ============================================================
     地面：草地大圆面 + 外围过渡面 + 地面细节容器
     （落叶 / 草 / 花在模型加载后按树冠尺寸填充 buildGroundDetails）
     ============================================================ */
  // 天气光衰减因子（叠加在昼夜基础上）
  const WEATHER_DIM = {
    clear:  1.0,
    cloudy: 0.74,
    wind:   0.86,
    rain:   0.40
  };

  // 雨丝贴图：细长条、两头虚化，斜着落下时不会看到一根硬边矩形
  function makeRainStreakTexture() {
    const c = document.createElement('canvas'); c.width = 8; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 8, 128);
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.00, 'rgba(255,255,255,0)');
    grad.addColorStop(0.18, 'rgba(238,246,252,0.55)');
    grad.addColorStop(0.72, 'rgba(232,242,250,0.9)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 128);
    // 中间再压一道亮芯，雨丝才有"水"的实感
    const core = g.createLinearGradient(0, 0, 0, 128);
    core.addColorStop(0.0, 'rgba(255,255,255,0)');
    core.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    core.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(3, 0, 2, 128);
    return mkTex(c);
  }

  // 雪花贴图：六角细晶 + 中心柔光。冬天不能再拿雨丝的长条贴图，否则像下针
  function makeSnowflakeTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    const cx = 64, cy = 64;
    // 外圈柔光，让雪片边缘虚掉
    const rg = g.createRadialGradient(cx, cy, 4, cx, cy, 42);
    rg.addColorStop(0, 'rgba(255,255,255,.95)');
    rg.addColorStop(0.42, 'rgba(248,252,255,.5)');
    rg.addColorStop(1, 'rgba(240,248,255,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, 42, 0, Math.PI * 2); g.fill();
    // 六条主臂 + 每条两处分叉
    g.strokeStyle = 'rgba(255,255,255,.92)';
    g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineWidth = 3.2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a) * 46, cy + Math.sin(a) * 46);
      g.stroke();
      g.lineWidth = 2.2;
      for (let k = 1; k <= 2; k++) {
        const t = 0.34 * k + 0.12;
        const bx = cx + Math.cos(a) * 46 * t, by = cy + Math.sin(a) * 46 * t;
        for (let s = -1; s <= 1; s += 2) {
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(bx + Math.cos(a + s * 0.95) * 13, by + Math.sin(a + s * 0.95) * 13);
          g.stroke();
        }
      }
    }
    // 中心小六边
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.arc(cx, cy, 5.5, 0, Math.PI * 2); g.fill();
    return mkTex(c);
  }

  // 雨线粒子（rain 时显示）：细长雨丝、高速下落、随风倾斜、远淡近实
  function buildRain() {
    const rainN = QUALITY === 'low' ? 820 : 1480;
    const geo = new THREE.PlaneGeometry(0.028, 1.0);
    const rainTex = makeRainStreakTexture();
    const snowTex = makeSnowflakeTexture();
    const mat = new THREE.MeshBasicMaterial({
      map: rainTex,
      color: 0xb9c8d8,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true
    });
    rainSystem = new THREE.InstancedMesh(geo, mat, rainN);
    rainSystem.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rainSystem.frustumCulled = false;
    rainSystem.visible = false;
    const d = new THREE.Object3D();
    rainSystem.userData.drops = [];
    for (let i = 0; i < rainN; i++) {
      rainSystem.userData.drops.push({
        x: (Math.random() - 0.5) * 62,
        y: Math.random() * 30,
        z: (Math.random() - 0.5) * 62,
        vy: 13 + Math.random() * 9,        // 真雨速，不是雪花飘
        sway: Math.random() * Math.PI * 2, // 雪花摇摆相位
        scale: 0.5 + Math.random() * 1.2,  // 雪花大小
        len: 0.30 + Math.random() * 0.52   // 雨丝长度（数量降下来后拉长一点补密度）
      });
    }
    scene.add(rainSystem);
    rainSystem.userData.rainTex = rainTex;
    rainSystem.userData.snowTex = snowTex;
    // 预编译：把雨材质的 shader 在加载时就编译好，点"雨"按钮才不会第一帧卡一下
    try {
      rainSystem.visible = true;
      renderer.compile(scene, camera);
      rainSystem.visible = false;
    } catch (e) {}
  }

  // 复用一个 Object3D 当临时矩阵载体：原来每帧 new 一个，1600~2000 次调用会持续制造垃圾、引发 GC 卡顿
  let _rainDummy = null;
  let rainFade = 0, rainTarget = 0;   // 雨丝淡入淡出：点了雨不该一下子砸下来

  function updateRain(dt, t) {
    if (!rainSystem) return;
    const isWinter = (currentSeason === 'winter');
    // 雨丝淡入淡出：点了雨不该一下子砸下来，也不该一键消失
    rainFade += (rainTarget - rainFade) * Math.min(1, dt * 6.0);
    if (rainFade < 0) rainFade = 0;
    if (rainFade > 1) rainFade = 1;
    // 冬天换成雪花贴图；雪不透明一点才立得住，雨丝偏虚
    rainSystem.material.opacity = (isWinter ? 0.70 : 0.36) * rainFade;
    if (!rainSystem.visible) return;
    const drops = rainSystem.userData.drops;
    if (!_rainDummy) _rainDummy = new THREE.Object3D();
    const d = _rainDummy;
    const vx = windStrength * 0.55;
    for (let i = 0; i < drops.length; i++) {
      const r = drops[i];
      // 雪只需要场上六百来片就够了，多出来的藏到地下，避免糊成一片白点
      if (isWinter && i >= 950) {
        d.position.set(0, -999, 0);
        d.scale.set(0.001, 0.001, 1);
        d.updateMatrix();
        rainSystem.setMatrixAt(i, d.matrix);
        continue;
      }
      if (isWinter) {
        // 雪花：慢速飘落 + 左右摇摆
        r.y -= (r.vy * 0.06) * dt;
        r.sway += dt * 1.5;
        r.x += Math.sin(r.sway) * 0.9 * dt + vx * 0.3 * dt;
      } else {
        // 雨滴：快速下落 + 风斜
        r.y -= r.vy * dt;
        r.x += vx * dt;
      }
      if (r.y < 0.26) {
        r.y = 26 + Math.random() * 6;
        // 雪片比雨丝小得多，重生成时收窄范围，才不会稀得像星星
        const span = isWinter ? 46 : 62;
        r.x = (Math.random() - 0.5) * span;
        r.z = (Math.random() - 0.5) * span;
      }
      d.position.set(r.x, r.y, r.z);
      if (isWinter) {
        // 雪花：小小的六角晶，缓缓自转，不能是长条（长条就成"下针"了）
        const ss = 0.12 + r.scale * 0.085;
        d.rotation.set(0, 0, r.sway * 0.5);
        // 几何体是 0.028×1.0 的雨丝长条，要摊成正方形，否则雪花永远是一根针
        d.scale.set(ss / 0.028, ss, 1);
      } else {
        // 雨丝长轴对齐下落方向（含风的横向分量），远处略细
        const ang = Math.atan2(vx, -r.vy);
        d.rotation.set(0, 0, ang);
        d.scale.set(0.55, r.len, 1);
      }
      d.updateMatrix();
      rainSystem.setMatrixAt(i, d.matrix);
    }
    rainSystem.instanceMatrix.needsUpdate = true;
  }

  // 花瓣与地面落叶的整体明度：雨天要压到暗景里，不能像雪一样发白
  function applyPetalTint() {
    const s = SEASONS[currentSeason];
    if (!s) return;
    const dim = currentWeather === 'rain' ? 0.58 : (currentWeather === 'cloudy' ? 0.82 : 1.0);
    if (petalSystem && petalSystem.material) {
      petalSystem.material.color.copy(s.petalTint || new THREE.Color(1, 1, 1)).multiplyScalar(dim);
    }
    if (groundDetailGroup) {
      groundDetailGroup.children.forEach(function (c) {
        if (c.material && c.material.color) { if (!c.material.userData.baseCol) c.material.userData.baseCol = c.material.color.clone(); c.material.color.copy(c.material.userData.baseCol).multiplyScalar(dim); }
      });
    }
  }

  // 应用天气：云层数量/明暗 + 天空色板 + 雨显隐 + 光照过渡到新目标
  function applyWeather(weather) {
    currentWeather = WEATHER_DIM[weather] ? weather : 'clear';
    // 天气驱动风力：风=持续大风（释放更多花瓣/斜雨/树冠摆动）
    if (currentWeather === 'wind') windStrength = Math.max(windStrength, 2.2);
    applyClouds(currentWeather);
    setSkyTarget();
    if (groundMesh && groundBaseColor) {
      groundMesh.material.color.copy(groundBaseColor).multiplyScalar(GROUND_WET[currentWeather] || 1.0);
    }
    if (rainSystem) {
      rainSystem.visible = (currentWeather === 'rain');
      rainTarget = (currentWeather === 'rain') ? 1 : 0;
      // 刚切到雨时给一个起点，避免第一帧完全看不见、等两帧才淡出来
      if (currentWeather === 'rain' && rainFade < 0.30) rainFade = 0.30;
    }
    applyPetalTint();
    updateCelestial();
    startLightLerp();
    document.querySelectorAll('[data-weather]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.weather === currentWeather);
    });
  }

  // 应用季节：树冠染色 + 飘落物贴图切换 + 地面细节换贴
  function applySeason(season) {
    if (!SEASONS[season]) return;
    currentSeason = season;
    const s = SEASONS[season];
    // 物理联动：冬季重力弱（雪轻飘）、夏/秋叶更重
    if (physicsWorld) physicsWorld.gravity.set(0, -SEASON_GRAVITY[currentSeason], 0);
    // 树冠 foliage 材质染色（主树 + 背景树 clone 共享材质）
    foliageMatList.forEach(function (mat) {
      mat.color.copy(s.foliageTint);
    });
    // 飘落物 + 地面落叶/小花贴图切换
    const tex = getSeasonTexture(season);
    if (petalSystem && petalSystem.material) {
      petalSystem.material.map = tex;
      applyPetalTint();
      petalSystem.material.needsUpdate = true;
    }
    // 冬天：降水粒子换成雪花晶（纯白、不透明一点）；其余季节切回雨丝贴图
    if (rainSystem && rainSystem.userData.rainTex) {
      const isW = (season === 'winter');
      const wantTex = isW ? rainSystem.userData.snowTex : rainSystem.userData.rainTex;
      if (rainSystem.material.map !== wantTex) {
        rainSystem.material.map = wantTex;
        rainSystem.material.needsUpdate = true;
      }
      rainSystem.material.color.set(isW ? 0xffffff : 0xb9c8d8);
    }
    // 地面落叶/小花重刷贴图
    if (groundDetailGroup) {
      groundDetailGroup.children.forEach(function (c) {
        if (c.isInstancedMesh && c.material && c.material.map) {
          c.material.map = tex;
          c.material.needsUpdate = true;
        }
      });
    }
    // 冬天地面变白（积雪覆盖），其他季节恢复泥土色
    if (groundMesh) {
      let base = 0x8a7260;
      if (season === 'winter') base = 0xd8e0ec;
      else if (season === 'autumn') base = 0x9a7a5c;
      groundBaseColor = new THREE.Color(base);
      // 雨天泥土吃水变深（湿地面），晴天恢复
      groundMesh.material.color.copy(groundBaseColor).multiplyScalar(GROUND_WET[currentWeather] || 1.0);
    }
    document.querySelectorAll('[data-season]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.season === currentSeason);
    });
  }

  function makeGroundTexture() {
    // 程序化泥土：深棕底 + 颗粒斑驳 + 明暗土斑 + 细小根须阴影（无需外部资源）
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#c0a68c';
    g.fillRect(0, 0, 512, 512);
    // 颗粒斑驳
    for (let i = 0; i < 26000; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, v = Math.random();
      g.fillStyle = v < 0.5
        ? 'rgba(96,78,62,' + (0.05 + v * 0.12) + ')'
        : 'rgba(220,200,176,' + (0.05 + v * 0.11) + ')';
      g.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    // 大块明暗土斑
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 18 + Math.random() * 62;
      const rg = g.createRadialGradient(x, y, 2, x, y, r);
      const d = Math.random();
      rg.addColorStop(0, d < 0.5 ? 'rgba(44,34,26,0.12)' : 'rgba(146,120,96,0.10)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // 细小根须 / 枯枝阴影
    g.strokeStyle = 'rgba(40,30,24,0.4)';
    for (let i = 0; i < 46; i++) {
      g.beginPath();
      let x = Math.random() * 512, y = Math.random() * 512;
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) {
        x += (Math.random() - 0.5) * 16; y += Math.random() * 10;
        g.lineTo(x, y);
      }
      g.lineWidth = 0.7 + Math.random() * 1.5;
      g.stroke();
    }
    const t = mkTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(5, 5);
    return t;
  }

  // 海洋：环绕岛屿的巨大海面（波浪纹理 + 流动动画 + 太阳反光）
  function makeSeaTexture() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    // 海蓝绿底色
    g.fillStyle = '#1e5f7e';
    g.fillRect(0, 0, 256, 256);
    // 水平波浪条纹（亮/暗交替，随 y 变化模拟波脊）
    for (let y = 0; y < 256; y++) {
      const wave = Math.sin(y * 0.55) * 0.5 + 0.5;
      const l = 42 + wave * 30 + Math.sin(y * 0.13 + 2) * 12;
      g.fillStyle = 'rgba(' + (36 + l * 0.25) + ',' + (92 + l * 0.42) + ',' + (126 + l * 0.35) + ',' + 0.5 + ')';
      g.fillRect(0, y, 256, 1);
    }
    // 波峰亮线 + 浪花沫
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * 256;
      const x = Math.random() * 256;
      const w = 6 + Math.random() * 26;
      g.fillStyle = 'rgba(200,235,248,' + (0.12 + Math.random() * 0.25) + ')';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w * 0.5, y + 1.5);
      g.lineTo(x + w, y);
      g.lineTo(x + w * 0.5, y - 1.5);
      g.closePath();
      g.fill();
    }
    const t = mkTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(18, 18);
    return t;
  }

  function buildSea() {
    // 程序化动态海面（非贴图）：GPU 多层波浪 + 波峰泡沫 + 菲涅尔 + 太阳高光 + 深浅渐变
    const geo = new THREE.PlaneGeometry(880, 880, 100, 100);
    geo.rotateX(-Math.PI / 2);
    seaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.45, 0.55, 0.3).normalize() },
        uCameraPos: { value: new THREE.Vector3(11, 6.4, 13) },
        uNight: { value: 0.0 },
        uRain: { value: 0.0 }
      },
      vertexShader: [
        'uniform float uTime;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormalW;',
        'void main() {',
        '  vec3 p = position;',
        // 三层不同波长/速度的正弦波叠加（真实海浪的非周期性）
        '  float w1 = sin(p.x * 0.30 + uTime * 1.10) * 0.06;',
        '  float w2 = sin(p.z * 0.38 + uTime * 0.85) * 0.05;',
        '  float w3 = sin((p.x + p.z) * 0.16 + uTime * 0.55) * 0.08;',
        '  p.y += w1 + w2 + w3;',
        '  vec4 wp = modelMatrix * vec4(p, 1.0);',
        '  vWorldPos = wp.xyz;',
        // 波浪斜率近似法线（导数）
        '  float dx = cos(p.x * 0.30 + uTime * 1.10) * 0.06 * 0.30 + cos((p.x + p.z) * 0.16 + uTime * 0.55) * 0.08 * 0.16;',
        '  float dz = cos(p.z * 0.38 + uTime * 0.85) * 0.05 * 0.38 + cos((p.x + p.z) * 0.16 + uTime * 0.55) * 0.08 * 0.16;',
        '  vNormalW = normalize(mat3(modelMatrix) * normalize(vec3(-dx, 1.0, -dz)));',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uSunDir;',
        'uniform vec3 uCameraPos;',
        'uniform float uNight;',
        'uniform float uRain;',
        'uniform float uTime;',
        'varying vec3 vWorldPos;',
        'varying vec3 vNormalW;',
        'void main() {',
        '  vec3 viewDir = normalize(uCameraPos - vWorldPos);',
        '  vec3 n = normalize(vNormalW);',
        // 菲涅尔：掠射角反光（真实水的边缘高亮）
        '  float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);',
        // 距离渐变：近处浅青、远处深海蓝
        '  float dist = length(vWorldPos.xz);',
        '  vec3 deep = mix(vec3(0.06, 0.22, 0.32), vec3(0.02, 0.05, 0.12), uNight);',
        '  vec3 shallow = mix(vec3(0.14, 0.40, 0.50), vec3(0.04, 0.10, 0.20), uNight);',
        '  vec3 col = mix(shallow, deep, clamp(dist / 380.0, 0.0, 1.0));',
        // 波峰泡沫：浪头高于阈值 → 破碎白沫
        '  float h = vWorldPos.y;',
        '  float foam = smoothstep(0.085, 0.15, h);',
        '  col = mix(col, mix(vec3(0.90, 0.95, 0.96), vec3(0.30, 0.38, 0.50), uNight), foam * 0.8);',
        // 菲涅尔天空反光（夜晚压暗成深蓝）
        '  col = mix(col, mix(vec3(0.60, 0.78, 0.90), vec3(0.10, 0.16, 0.30), uNight), fresnel * 0.5 * (1.0 - uRain * 0.82));',
        // 雨天：海面压暗去饱和，天空反光变成灰，太阳光路基本消失
        '  col = mix(col, mix(col, vec3(0.12, 0.145, 0.175), 0.85), uRain);',
        // 太阳高光（夜晚是月光高光，更弱偏蓝）
        '  vec3 halfV = normalize(viewDir + uSunDir);',
        '  float spec = pow(max(dot(n, halfV), 0.0), 200.0);',
        '  col += mix(vec3(1.0, 0.97, 0.88), vec3(0.6, 0.7, 1.0), uNight) * spec * mix(0.55, 0.18, uNight);',
        // 长条反光光路：太阳/月亮水平方位 → 水面一条从脚下延伸到地平线的亮带，叠加粼粼碎闪
        '  vec2 sunH = normalize(uSunDir.xz + vec2(1e-4, 1e-4));',
        '  vec2 viewH = normalize(uCameraPos.xz - vWorldPos.xz + vec2(1e-4, 1e-4));',
        '  float align = max(dot(sunH, viewH), 0.0);',
        '  float path = pow(align, 10.0) * smoothstep(6.0, 130.0, dist);',
        // 高频 hash 碎闪（格点随机 + 时间扰动）
        '  vec2 cell = floor(vWorldPos.xz * 2.6);',
        '  float g = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);',
        '  float tw = step(0.55, g) * (0.5 + 0.5 * sin(uTime * 3.0 + g * 40.0));',
        '  float pathGlow = path * (0.40 + 0.60 * tw);',
        '  col += mix(vec3(1.0, 0.96, 0.86), vec3(0.55, 0.65, 0.95), uNight) * pathGlow * mix(0.60, 0.22, uNight) * (1.0 - uRain * 0.85);',
        '  col *= (1.0 - uRain * 0.34);',
        '  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));',
        '}'
      ].join('\n'),
      side: THREE.DoubleSide
    });
    seaMesh = new THREE.Mesh(geo, seaMat);
    seaMesh.position.y = 0;
    scene.add(seaMesh);
  }

  /* ============================================================
     环境音：程序化海浪（滤波噪声）+ 间歇鸟啁啾（WebAudio，
     无外部音频文件；首次交互后启动，符合浏览器自动播放策略）
     ============================================================ */
  function initAmbientAudio() {
    if (ambientStarted) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
    } catch (e) { return; }
    ambientStarted = true;
    // 海浪：循环白噪声 → 低通滤波 → 慢速起伏
    const len = audioCtx.sampleRate * 3;
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioCtx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const waveGain = audioCtx.createGain(); waveGain.gain.value = 0.06;
    noise.connect(lp); lp.connect(waveGain); waveGain.connect(audioCtx.destination);
    noise.start();
    const lfo = audioCtx.createOscillator(); lfo.frequency.value = 0.15;
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain); lfoGain.connect(waveGain.gain); lfo.start();
    scheduleBird();
  }

  function scheduleBird() {
    if (!audioCtx) return;
    const isDay = currentTimeMode === 'day';
    const delay = isDay ? 3000 + Math.random() * 7000 : 9000 + Math.random() * 12000;
    birdTimer = setTimeout(function () {
      if (currentTimeMode === 'day') playBirdChirp();
      scheduleBird();
    }, delay);
  }

  function playBirdChirp() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const notes = 2 + (Math.random() * 3 | 0);
    for (let k = 0; k < notes; k++) {
      const t0 = now + k * 0.12;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      const f0 = 1800 + Math.random() * 1200;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.3 + Math.random() * 0.4), t0 + 0.06);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t0 + 0.11);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.14);
    }
  }

  function updateSea(dt, t) {
    if (!seaMesh) return;
    if (seaMat) {
      seaMat.uniforms.uTime.value = t;
      seaMat.uniforms.uCameraPos.value.copy(camera.position);
      const nightTarget = (currentTimeMode === 'night') ? 1.0 : 0.0;
      seaMat.uniforms.uNight.value += (nightTarget - seaMat.uniforms.uNight.value) * Math.min(dt * 2.0, 1);
      // 雨天：海面变暗变灰，太阳光路消失
      const rainTarget = (currentWeather === 'rain') ? 1.0 : (currentWeather === 'cloudy' ? 0.45 : 0.0);
      seaMat.uniforms.uRain.value += (rainTarget - seaMat.uniforms.uRain.value) * Math.min(dt * 2.6, 1);
      // 反光方向跟随当前天体：白天太阳、夜晚月亮
      const body = (currentTimeMode === 'night') ? moonMesh : sunMesh;
      if (body && body.visible) {
        seaMat.uniforms.uSunDir.value.copy(body.position).normalize();
      }
    }
    // 海岸环浪涌：泡沫带随海浪"呼吸"（顶点 y 环向起伏，浪花涌上沙滩再退）
    if (shoreMesh) {
      const pos = shoreMesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r0 = Math.sqrt(x * x + z * z);
        const y = 0.26 + Math.sin(r0 * 0.8 - t * 1.4) * 0.028 +
                   Math.sin(x * 0.15 + t * 0.7) * 0.015;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      shoreMesh.geometry.computeVertexNormals();
    }
  }

  // 海岸渐变过渡贴图：湿润沙滩(窄,压暗) → 浅水 → 白色浪花泡沫线 → 深水 → 海
  function makeShoreGradientTexture() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
    grad.addColorStop(0.0, 'rgba(120,102,84,0.0)');       // 岛屿下方透明（泥土色由岛屿本体提供）
    grad.addColorStop(0.42, 'rgba(186,164,138,0.78)');    // 干沙滩
    grad.addColorStop(0.55, 'rgba(152,132,110,0.88)');    // 湿润沙滩（被潮水打湿）
    grad.addColorStop(0.66, 'rgba(78,108,118,0.85)');   // 浅水过渡
    grad.addColorStop(0.72, 'rgba(226,238,240,0.55)');  // 浪花泡沫线（收窄、降透明，靠浪涌动画呼吸）
    grad.addColorStop(0.82, 'rgba(48,104,134,0.6)');    // 深水
    grad.addColorStop(1.0, 'rgba(30,80,110,0.0)');      // 与海面无缝衔接
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    return mkTex(c);
  }

  function buildGround() {
    // 岛屿本体（泥土纹理圆盘，接收阴影）——扩大到 r32，覆盖主树+全部背景树（树不再插水里）
    const groundTex = makeGroundTexture();
    const g = new THREE.CircleGeometry(32, 64);
    const m = new THREE.MeshStandardMaterial({
      map: groundTex, color: 0x8a7260, roughness: 1.0, metalness: 0.0
    });
    const ground = new THREE.Mesh(g, m);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.32;
    ground.receiveShadow = true;
    groundMesh = ground;
    scene.add(ground);

    // 海岸渐变过渡环：泥土→沙滩→浅水→海水，径向渐变贴图 + 顶点浪涌动画（r52 配套岛 r32）
    const sGeo = new THREE.CircleGeometry(52, 80);
    const sMat = new THREE.MeshStandardMaterial({
      map: makeShoreGradientTexture(), transparent: true,
      roughness: 1.0, metalness: 0.0, depthWrite: false
    });
    shoreMesh = new THREE.Mesh(sGeo, sMat);
    shoreMesh.rotation.x = -Math.PI / 2;
    shoreMesh.position.y = 0.26;
    scene.add(shoreMesh);

    // 地面细节容器
    groundDetailGroup = new THREE.Group();
    scene.add(groundDetailGroup);
  }

  /* ============================================================
     地面细节：樱花落叶 + 小花（程序化实例化，模型加载后调用）
     ============================================================ */
  function buildGroundDetails() {
    if (!groundDetailGroup || !modelBox) return;

    // 清空旧细节（重载/换模型时安全）
    while (groundDetailGroup.children.length) {
      const c = groundDetailGroup.children[0];
      groundDetailGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }

    // 树冠视觉半径（归一化后）
    const r = Math.max(modelBox.size.x, modelBox.size.z) * 0.5;
    const d = new THREE.Object3D();

    // 撒点中心：主树 + 每棵背景树（落叶/小花环绕所有树，而非只有主树）
    const spots = [{ x: 0, z: 0, rMul: 1.0 }];
    backgroundTrees.forEach(function (g) {
      spots.push({ x: g.position.x, z: g.position.z, rMul: 0.7 });
    });
    function pickSpot() {
      if (spots.length === 1) return spots[0]; // 单树模式只有主树
      const p = Math.random();
      if (p < 0.55) return spots[0]; // 主树周围为主
      return spots[1 + ((Math.random() * (spots.length - 1)) | 0)];
    }

    /* ---- 1) 地面落叶（静态五瓣花瓣，水平贴地） ---- */
    const leafCount = QUALITY === 'low' ? 500 : 950;
    const leafMat = new THREE.MeshBasicMaterial({
      map: getSeasonTexture(currentSeason), color: 0xe0a1b6, transparent: true, alphaTest: 0.42,
      side: THREE.DoubleSide, depthWrite: false
    });
    const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.36, 0.36), leafMat, leafCount);
    leaves.receiveShadow = false;
    for (let i = 0; i < leafCount; i++) {
      const sp = pickSpot();
      const rr = (0.18 + Math.random() * 1.32) * r * sp.rMul;
      const ang = Math.random() * Math.PI * 2;
      d.position.set(sp.x + Math.cos(ang) * rr, 0.326 + Math.random() * 0.016, sp.z + Math.sin(ang) * rr);
      d.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.18, 0, Math.random() * Math.PI * 2);
      d.scale.setScalar(0.5 + Math.random() * 0.95);
      d.updateMatrix();
      leaves.setMatrixAt(i, d.matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
    groundDetailGroup.add(leaves);

    /* ---- 2) 草丛：已移除（用户要求去掉草地，背景改为多棵樱花树） ---- */

    /* ---- 3) 小花（粉白五瓣，点缀树间） ---- */
    const flowerN = QUALITY === 'low' ? 70 : 150;
    const flowerMat = new THREE.MeshStandardMaterial({
      map: getSeasonTexture(currentSeason), transparent: true, alphaTest: 0.42,
      roughness: 0.75, side: THREE.DoubleSide, depthWrite: false,
      emissive: 0xffd9e4, emissiveIntensity: 0.28
    });
    const flowers = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.17, 0.17), flowerMat, flowerN);
    for (let i = 0; i < flowerN; i++) {
      const sp = pickSpot();
      const rr = (0.4 + Math.random() * 1.1) * r * sp.rMul;
      const ang = Math.random() * Math.PI * 2;
      d.position.set(sp.x + Math.cos(ang) * rr, 0.334 + Math.random() * 0.014, sp.z + Math.sin(ang) * rr);
      d.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      d.scale.setScalar(0.5 + Math.random() * 0.9);
      d.updateMatrix();
      flowers.setMatrixAt(i, d.matrix);
    }
    flowers.instanceMatrix.needsUpdate = true;
    groundDetailGroup.add(flowers);
  }

  /* ============================================================
     生态氛围：真实 3D 鸟模型（three.js 官方 Parrot.glb，改白+扇翅动画）
     + 低面几何蝴蝶（非贴图，真实体积）
     兜底：bird.glb 若解析不兼容，回退程序化低面海鸥（真实几何+扇翅）
     ============================================================ */
  let birdModels = [], birdMixers = [], butterflies = [], gulls = [], dogMixers = [];
  let gullsBuilt = false;
  function buildProceduralGulls() {
    if (gullsBuilt || !modelBox) return;
    gullsBuilt = true;
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.75 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.8 });
    const beakMat = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5 });
    const count = QUALITY === 'low' ? 3 : 5;
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), bodyMat);
      body.scale.set(1, 0.55, 0.42);
      body.rotation.y = Math.PI / 2;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), bodyMat);
      head.position.set(0.42, 0.02, 0);
      g.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), beakMat);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(0.56, -0.02, 0);
      g.add(beak);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.22), wingMat);
      tail.position.set(-0.5, 0.06, 0);
      tail.rotation.z = 0.35;
      g.add(tail);
      const wings = [];
      [-1, 1].forEach(function (side) {
        const pivot = new THREE.Group();
        pivot.position.x = side * 0.22;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 0.32), wingMat);
        wing.position.x = side * 0.42;
        wing.rotation.y = side > 0 ? -0.12 : 0.12;
        pivot.add(wing);
        g.add(pivot);
        wings.push({ pivot: pivot, side: side, phase: Math.random() * Math.PI * 2 });
      });
      g.scale.setScalar(0.85 + Math.random() * 0.3);
      g.userData = {
        r: 16 + Math.random() * 12, h: 9 + Math.random() * 8,
        speed: 0.1 + Math.random() * 0.16, phase: Math.random() * Math.PI * 2,
        dir: Math.random() > 0.5 ? 1 : -1, amp: 0.7 + Math.random() * 1.1,
        freq: 0.6 + Math.random() * 0.7,
        wings: wings, flap: 3.2 + Math.random() * 1.6
      };
      scene.add(g);
      gulls.push(g);
    }
    console.log('[gull] 程序化海鸥 ' + count + ' 只（bird.glb 兜底）');
  }
  function buildWildlife() {
    if (!modelBox) return;
    // 飞鸟：官方 GLB（带翅膀扇动动画），改白色海鸥质感，绕树轨道
    const loader = new THREE.GLTFLoader();
    loader.load('models/bird.glb', function (gltf) {
      console.log('[bird] onLoad 回调执行（GLB 解析成功）');
      const clips = gltf.animations || [];
      // 测量原始尺寸，归一化到翼展 ~1.7（树放大后鸟同步放大）
      let birdSpan = 1.7;
      try {
        const bb = new THREE.Box3().setFromObject(gltf.scene);
        const sz = bb.getSize(new THREE.Vector3());
        if (sz.x > 0.01) birdSpan = 1.3 / Math.max(sz.x, sz.y, sz.z);
      } catch (e) { /* 忽略 */ }
      const birdCount = QUALITY === 'low' ? 3 : 5;
      for (let i = 0; i < birdCount; i++) {
        const m = gltf.scene.clone(true);
        // 去原纹理 + 统一白灰（海鸥质感），覆盖材质数组（Parrot 多材质）
        m.traverse(function (o) {
          if (o.isMesh) {
            o.castShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(function (mm) {
              if (mm) {
                mm.map = null;
                mm.vertexColors = false; // 覆盖顶点色（Parrot 用 vertexColors 着色）
                if (mm.color) mm.color.set(0xececea);
                mm.roughness = 0.85;
                mm.needsUpdate = true;
              }
            });
          }
        });
        m.scale.setScalar(birdSpan * (0.85 + Math.random() * 0.3));
        m.userData = {
          r: 16 + Math.random() * 12, h: 9 + Math.random() * 8,
          speed: 0.1 + Math.random() * 0.16, phase: Math.random() * Math.PI * 2,
          dir: Math.random() > 0.5 ? 1 : -1, amp: 0.7 + Math.random() * 1.1,
          freq: 0.6 + Math.random() * 0.7
        };
        scene.add(m);
        birdModels.push(m);
        if (clips.length && THREE.AnimationMixer) {
          const mixer = new THREE.AnimationMixer(m);
          const action = mixer.clipAction(clips[0]);
          action.play();
          mixer.timeScale = 0.7 + Math.random() * 0.6; // 兼容 r128：mixer.timeScale 而非 action.setEffectiveSpeed
          birdMixers.push(mixer);
        }
      }
    }, undefined, function (err) {
      console.error('[bird] GLB 加载失败，回退程序化海鸥:', err);
      buildProceduralGulls();
    });
    // 兜底：bird.glb 长时间无回调（加载器不兼容）则程序化海鸥
    setTimeout(function () {
      if (!birdModels.length && !gullsBuilt) buildProceduralGulls();
    }, 12000);
    // 蝴蝶已移除（用户反馈像飞蛾，太丑）
    console.log('[wildlife] birds=' + birdModels.length + ' butterflies=0');
  }

  // 树底两只小狗（免费 GLB）：比格 + 德国牧羊犬，骨骼动画驱动四肢 + 互相嬉戏互动
  const dogActors = []; // { obj, base:{x,z,rotY}, phase, mixer, clipName, s }
  function buildDogs() {
    if (!modelBox) return;
    const loader = new THREE.GLTFLoader();
    // 卡通狗配色：cartoon_shiba.glb 是分色材质（Main 主体 / Main_Light 浅色 / Black 描边 / 眼睛），
    // 按材质名改色，眼睛和黑描边一律不动，保住"线条卡通"的干净观感
    function paintDog(mesh, mode) {
      if (mode === 'corgi') return; // Corgi 自带贴图，保留原色
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let mi = 0; mi < mats.length; mi++) {
        const m = mats[mi];
        if (!m) continue;
        const nm = (m.name || '').toLowerCase();
        if (nm.indexOf('eye') >= 0 || nm.indexOf('pupil') >= 0 || nm.indexOf('black') >= 0) continue;
        if (mode === 'golden') {
          m.color = new THREE.Color(nm.indexOf('light') >= 0 ? 0xe8c37a : 0xbe8340);
        } else if (mode === 'white') {
          m.color = new THREE.Color(nm.indexOf('light') >= 0 ? 0xe8e1d2 : 0xf6f0e4);
        } else if (mode === 'black') {
          // 黑柴：背毛近黑褐，胸口/脸颊的浅色留成奶油，比纯黑有层次
          m.color = new THREE.Color(nm.indexOf('light') >= 0 ? 0xb9a288 : 0x3b3028);
        }
        m.roughness = 0.86;
        m.metalness = 0.0;
        m.needsUpdate = true;
      }
    }

    const dogs = [
      { url: 'models/cartoon_shiba.glb', name: '小鸡毛', idx: 0, spot: { x: -1.05, z: 3.32, rotY: -1.52, scaleMul: 1.0 }, h: 1.46, phase: 0,   paint: 'golden' }
    ];
    dogs.forEach(function (d) {
      loader.load(d.url, function (gltf) {
        try {
          const bb = new THREE.Box3().setFromObject(gltf.scene);
          const sz = bb.getSize(new THREE.Vector3());
          const s = d.h / Math.max(sz.y, 0.001);
          const dog = gltf.scene;
          // 卡通狗要"矮胖圆"，纯等比放大只会变瘦长：横向略收、纵向压一点
          const sq = d.spot.scaleMul;
          // 卡通狗要"矮胖圆"：等比缩放只会更瘦长，所以横向略撑、纵向压扁
          const fw = 1.14, fh = 0.84;
          dog.scale.set(s * sq * fw, s * sq * fh, s * sq * fw);
          // 脚底对齐岛面（岛面 y=0.32，见 buildGround）：先量 minY 再抬升，脚刚好贴地不陷不飘
          const footY = 0.32 + (-bb.min.y * s * sq * fh);
          dog.position.set(d.spot.x, footY, d.spot.z);
          dog.rotation.y = d.spot.rotY;
          let skinned = 0;
          const skinnedMeshes = [];
          dog.traverse(function (o) {
            if (o.isMesh) {
              o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true;
              // 这两种 GLB 都是真贴图 / 分色材质，按品种改色而不是整只刷成纯色
              paintDog(o, d.paint);
              if (o.isSkinnedMesh && o.skeleton) skinnedMeshes.push(o);
            }
            if (o.isSkinnedMesh) skinned++;
          });
          // 线条卡通：每块蒙皮网格套一层反向外扩的深色外壳。共用同一副骨骼，走动时描边不会脱节
          const outlineMat = new THREE.MeshBasicMaterial({ color: 0x3a2416, side: THREE.BackSide });
          for (let oi = 0; oi < skinnedMeshes.length; oi++) {
            const src = skinnedMeshes[oi];
            try {
              const ol = new THREE.SkinnedMesh(src.geometry, outlineMat);
              ol.bind(src.skeleton, src.bindMatrix);
              ol.position.copy(src.position);
              ol.rotation.copy(src.rotation);
              ol.scale.copy(src.scale).multiplyScalar(1.05);
              ol.renderOrder = -1;
              ol.frustumCulled = true;
              src.parent.add(ol);
            } catch (e) { console.warn('[dog] 描边失败:', e && e.message); }
          }
          // 头（和耳朵）放大一点更"Q"：骨骼缩放不影响 mixdr 写的关键帧（动画只写 position/quaternion）
          dog.traverse(function (o) {
            if (o.isBone) {
              const nm = o.name || '';
              if (nm === 'Head') o.scale.multiplyScalar(1.16);
              else if (nm.indexOf('Ear1') === 0) o.scale.multiplyScalar(1.06);
            }
          });
          scene.add(dog);
          // 这只柴犬的 24 段动画里没有"坐"和"趴"，只有 Idle / Walk / Gallop / Eating 等，
          // 所以坐和趴只能自己摆骨骼：按名字把要用的几根挑出来，并记下初始姿态作为插值基准
          const boneOf = function (re) {
            const out = [];
            dog.traverse(function (n) {
              if (n.isBone && re.test(n.name || '')) {
                if (!n.userData.q0) n.userData.q0 = n.quaternion.clone();
                out.push(n);
              }
            });
            return out;
          };
          const bones = {
            body: boneOf(/^Body$|^Spine$|^Hips$/)[0] || null,
            back: boneOf(/^Back$/)[0] || null,
            head: boneOf(/^Head$/)[0] || null,
            fu: boneOf(/FrontUpperLeg|LegF/),
            fl: boneOf(/FrontLowerLeg/),
            bu: boneOf(/BackUpperLeg|LegB/),
            bl: boneOf(/BackLowerLeg/),
            bk: boneOf(/^BackLeg/)
          };
          // 骨骼动画：双动作——Walk（四肢弯曲走路）+ Idle（停驻呼吸），weight 交叉淡化切换
          // 走路时外部位移速度与步态匹配，避免"原地迈步漂移"
          const clips = gltf.animations || [];
          const BAD_ANIM = ['death', 'die', 'dead', 'attack', 'hurt', 'fall', 'lie', 'sleep', 'swim', 'bite', 'fight', 'fear', 'growl'];
          const isBad = function (nm) { for (const b of BAD_ANIM) if (nm.indexOf(b) >= 0) return true; return false; };
          let mixer = null, walkAct = null, idleAct = null, gallopAct = null, lowAct = null, clipName = null;
          // clip 时长要在下面那个 if 块外面用（步频换算），所以先提到这里声明
          let walkDur = 1.2, galDur = 1.0;
          if (clips.length && THREE.AnimationMixer && skinned > 0) {
            // 这套 clip 里有 Idle / Idle_2 / Idle_2_HeadLow / Idle_HitReact_Left / Idle_HitReact_Right，
            // 用 indexOf('idle') 会先撞上 Idle_HitReact_Left（被击中扭头的动作），狗看起来一直歪着抬头。
            // 所以这里必须按名字精确取，只认正版 Idle。
            const exactClip = function (base) {
              const re = new RegExp('^(animalarmature\\|)?' + base + '$');
              for (let ci = 0; ci < clips.length; ci++) {
                const nm = (clips[ci].name || '').toLowerCase();
                if (re.test(nm)) return clips[ci];
              }
              return null;
            };
            const findClip = function (pat) {
              for (let ci = 0; ci < clips.length; ci++) {
                const nm = (clips[ci].name || '').toLowerCase();
                if (nm.indexOf(pat) >= 0 && !isBad(nm)) return clips[ci];
              }
              return null;
            };
            mixer = new THREE.AnimationMixer(dog);
            const wClip = exactClip('walk') || findClip('walk');
            const iClip = exactClip('idle') || exactClip('idle_2') || findClip('idle');
            const gClip = exactClip('gallop') || exactClip('gallop_jump') || findClip('gallop');
            if (wClip) { walkAct = mixer.clipAction(wClip); walkAct.setEffectiveTimeScale(0.9); walkDur = wClip.duration || walkDur; }
            if (gClip) { gallopAct = mixer.clipAction(gClip); gallopAct.setEffectiveTimeScale(1.15); galDur = gClip.duration || galDur; }
            idleAct = mixer.clipAction(iClip || clips[0]);
            idleAct.setEffectiveTimeScale(0.8);
            if (walkAct) { walkAct.play(); walkAct.setEffectiveWeight(0); }
            if (gallopAct) { gallopAct.play(); gallopAct.setEffectiveWeight(0); }
            idleAct.play();
            idleAct.setEffectiveWeight(1);
            // Idle_2_HeadLow 是低头嗅地的待机动作，停下来嗅的时候用这个
            const lClip = exactClip('idle_2_headlow') || exactClip('idle_2headlow');
            if (lClip) { lowAct = mixer.clipAction(lClip); lowAct.play(); lowAct.setEffectiveWeight(0); lowAct.setEffectiveTimeScale(0.7); }
            clipName = (iClip ? iClip.name : '') + ' / ' + (wClip ? wClip.name : '-') + ' / ' + (gClip ? gClip.name : '-');
          }
          // 这里必须看"Root 的水平位移幅度"，不能只看是否含 Root.position 这个 track。
          // Quaternius 的模型有名为 Root 的骨骼，走路动画里它只做上下起伏，水平位移是 0；
          // 之前一律判成 root motion，走路分支就永远不推进位置，狗看起来一直在原地踏步。
          // 强制 rootMotion=false：Quaternius 模型的 Root 轨迹常被误判为 root motion，
          // 导致代码不手动位移，狗就原地踏步。位移完全由代码控制。
          let rootMotion = false;
          dogActors[d.idx] = { obj: dog, base: { x: d.spot.x, z: d.spot.z, rotY: d.spot.rotY }, phase: d.phase, mixer: mixer, walkAct: walkAct, idleAct: idleAct, gallopAct: gallopAct, clipName: clipName, s: s * d.spot.scaleMul, h: d.h, footY: footY, rootMotion: rootMotion, speed: d.h * 1.6, faceFlip: 0, scaleY: s * sq * fh, spd: 0, stepPhase: 0, walkDur: walkDur, galDur: galDur, bones: bones, lowAct: lowAct, lieK: 0, sitK: 0 };
          console.log('[dog] ' + d.name + ' 已放置 clips=' + clips.length + ' skinned=' + skinned + ' anim=' + clipName);
        } catch (e) { console.error('[dog] ' + d.name + ' 构建失败（不影响主流程）:', e); }
      }, undefined, function (err) {
        console.warn('[dog] ' + d.name + ' 加载失败（不影响主流程）:', err && err.message ? err.message : err);
      });
    });
  }

  // 单只金毛的行为循环：走到 A → 低头嗅地 → 走到 B → 冲刺 → 趴下 → 坐一会 → 起身站定。
  // 坐和趴这套模型没有现成动画，靠 poseDog() 手摆骨骼。
  const _pE = (typeof THREE !== 'undefined') ? new THREE.Euler() : null;
  const _pQ = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
  const _pQ1 = (typeof THREE !== 'undefined') ? new THREE.Quaternion() : null;
  function poseDog(a, kLie, kSit) {
    const B = a.bones;
    if (!B) return;
    // 只改局部旋转，基准是骨骼绑定时（rest）的姿态
    const set = function (arr, rx, k) {
      if (!arr || !arr.length || k <= 0.001) return;
      for (let i = 0; i < arr.length; i++) {
        const n = arr[i], q0 = n.userData.q0;
        if (!q0) continue;
        _pE.set(rx, 0, 0, 'XYZ');
        _pQ.setFromEuler(_pE);
        _pQ1.copy(q0).multiply(_pQ);
        n.quaternion.copy(q0).slerp(_pQ1, Math.min(k, 1));
      }
    };
    if (kSit >= kLie) {
      // 坐：后腿三根骨是父子链，角度要"髋少、膝多、踝补"，否则整条腿会拧进肚子里、脚掌穿地露黑
      // 具体角度可从 window.__sitAng 临时覆写（调参用，不影响正式表现）
      const A = (typeof window !== 'undefined' && window.__sitAng) || {};
      const g = function (k, dft) { return (typeof A[k] === 'number') ? A[k] : dft; };
      set(B.bk, g('bk', 0.18), kSit);
      set(B.bu, g('bu', -1.55), kSit);
      set(B.bl, g('bl', 2.08), kSit);
      set(B.fu, g('fu', 0.0), kSit);
      set(B.body ? [B.body] : null, g('body', -0.48), kSit);
      set(B.head ? [B.head] : null, g('head', 0.10), kSit);
    } else {
      // 趴：前腿向前伸直趴平，后腿收到身侧，身体整体压低贴地
      set(B.fu, -1.35, kLie);
      set(B.fl, 0.15, kLie);
      set(B.bu, -0.65, kLie);
      set(B.bl, 0.75, kLie);
      set(B.body ? [B.body] : null, 0.12, kLie);
      set(B.head ? [B.head] : null, 0.05, kLie);
    }
  }

  function updateDogs(dt, t) {
    const a = dogActors[0];
    if (!a) return;
    const o = a.obj;
    // 角度差归一到 [-PI, PI]。用取模而不是 while 循环：
    // 万一某个值算成 NaN，while 的条件永远不成立会直接把页面主线程锁死
    const wrapPi = function (v) {
      if (!isFinite(v)) return 0;
      return ((v + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    };
    // 固定伪随机：同一个轮次内稳定、换轮次才变，避免每帧抖动
    const hh = function (i) {
      const x = Math.sin(i * 127.1 + a.phase * 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const T = 38;
    const cyc = Math.floor((t + a.phase) / T);
    const tt = ((t + a.phase) % T + T) % T;
    const edge = function (base, i) { return base + (hh(cyc * 9 + i) - 0.5) * 0.8; };
    const b1 = edge(5.0, 1);
    const b2 = b1 + edge(2.5, 2);
    const b3 = b2 + edge(5.0, 3);
    const b4 = b3 + edge(4.0, 4);
    const b5 = b4 + edge(4.0, 5);
    const b6 = b5 + edge(5.0, 6);
    const b7 = b6 + edge(4.0, 7);
    // 活动半径扩大到整个岛：落脚点在岛上随机取点
    const Ax = a.base.x + (hh(cyc * 13 + 1) - 0.5) * 22, Az = a.base.z + (hh(cyc * 13 + 2) - 0.5) * 16;
    const Bx = a.base.x + (hh(cyc * 13 + 3) - 0.5) * 22, Bz = a.base.z + (hh(cyc * 13 + 4) - 0.5) * 16;
    // 冲刺点：随机方位、远距
    const rAng = hh(cyc * 17 + 7) * Math.PI * 2;
    const Rx = a.base.x + Math.cos(rAng) * 14;
    const Rz = a.base.z + Math.sin(rAng) * 14;

    let gx, gz, mode;
    if (tt < b1) {
      gx = Ax; gz = Az; mode = 'walk';
    } else if (tt < b2) {
      gx = Ax; gz = Az; mode = 'sniff';
    } else if (tt < b3) {
      gx = Bx; gz = Bz; mode = 'walk';
    } else if (tt < b4) {
      gx = Rx; gz = Rz; mode = 'run';
    } else if (tt < b5) {
      gx = a.base.x; gz = a.base.z; mode = 'walk';
    } else if (tt < b6) {
      gx = a.base.x; gz = a.base.z; mode = 'lie';
    } else if (tt < b7) {
      gx = a.base.x; gz = a.base.z; mode = 'sit';
    } else {
      gx = a.base.x; gz = a.base.z; mode = 'idle';
    }

    // 调试钩子：window.__dogPose = 'sit'/'lie' 时把模式直接锁到该姿态（不设就不生效）
    if (window.__dogPose === 'sit' || window.__dogPose === 'lie') {
      mode = window.__dogPose;
      gx = a.base.x; gz = a.base.z;
    }
    a.mode = mode;
    // 没有骨骼动画的模型不做位移，否则就是"滑行"
    if (!(a.mixer && a.walkAct)) { gx = a.base.x; gz = a.base.z; }
    const distTo = Math.hypot(gx - o.position.x, gz - o.position.z);
    const moving = (mode === 'walk' || mode === 'run') && distTo > 0.14;

    // 坐 / 趴的过渡权重
    a.lieK += ((mode === 'lie' ? 1 : 0) - a.lieK) * Math.min(dt * 2.6, 1);
    a.sitK += ((mode === 'sit' ? 1 : 0) - a.sitK) * Math.min(dt * 2.6, 1);
    // 调试钩子：window.__dogPose = 'sit' / 'lie' 时强制姿态（不设就不生效，正常播放完全不受影响）
    if (window.__dogPose === 'sit') { a.sitK = 1; a.lieK = 0; }
    else if (window.__dogPose === 'lie') { a.lieK = 1; a.sitK = 0; }

    // 朝向：走和跑都朝目标点；站着时慢慢转回原来侧对镜头的角度
    let wantRot = null;
    if (moving) wantRot = Math.atan2(gx - o.position.x, gz - o.position.z) - (a.faceFlip || 0);
    else if (mode === 'idle' || mode === 'sniff' || mode === 'sit') wantRot = a.base.rotY;
    if (wantRot !== null) {
      const dr = wrapPi(wantRot - o.rotation.y);
      const rate = moving ? (mode === 'run' ? dt * 4.2 : dt * 3.2) : dt * 1.3;
      o.rotation.y += dr * Math.min(rate, 1);
      o.rotation.y = wrapPi(o.rotation.y);
    }
    // 走起来身体跟着步伐轻微侧倾，纯平移会很僵
    if (moving) o.rotation.z = Math.sin(a.stepPhase * Math.PI * 4) * 0.03;
    else o.rotation.z += (0 - o.rotation.z) * Math.min(dt * 2.5, 1);

    if (moving) {
      const spdMax = (a.speed || 0.7) * (mode === 'run' ? 2.0 : 1);
      // 起步加速 / 临近目标减速：匀速直线推进是最"机械"的一环
      const wantSpd = spdMax * Math.max(0.30, Math.min(1, distTo / 0.30));
      a.spd += (wantSpd - a.spd) * Math.min(dt * 3.0, 1);
      if (!a.rootMotion) {
        const step = a.spd * dt;
        const ux = (gx - o.position.x) / (distTo || 1);
        const uz = (gz - o.position.z) / (distTo || 1);
        o.position.x += ux * step;
        o.position.z += uz * step;
      }
      // 步频锁到实际速度：stride = 一个 walk 周期前进的距离，速度变了步频跟着变，
      // 否则脚会和地面不同步，看起来就是"踩着滑板"
      const stride = 1.15 * (a.h || 1.2);
      const cps = Math.max(0.55, a.spd / stride);
      if (a.walkAct) a.walkAct.timeScale = cps * (a.walkDur || 1.2);
      if (a.gallopAct) a.gallopAct.timeScale = Math.max(0.7, cps * 1.45);
      a.stepPhase += dt * cps;
    } else {
      a.spd += (0 - a.spd) * Math.min(dt * 3.0, 1);
      // 停住就是真停住：只在边界上小幅收口，不能持续平移，否则趴/坐的几秒狗会滑动
      const settle = Math.min(dt * 2.2, 1);
      if (Math.hypot(gx - o.position.x, gz - o.position.z) < 0.12) {
        o.position.x += (gx - o.position.x) * settle;
        o.position.z += (gz - o.position.z) * settle;
      }
    }

    if (a.mixer) {
      const kPose = Math.max(a.lieK, a.sitK);
      const tWalk = (moving && mode === 'walk') ? 1 : 0;
      const tGal = (moving && mode === 'run') ? 1 : 0;
      const tLow = (mode === 'sniff') ? 1 - kPose : 0;
      const lerpW = function (act, target) {
        if (!act) return 0;
        const w = act.getEffectiveWeight();
        const nw = w + (target - w) * Math.min(dt * 4, 1);
        act.setEffectiveWeight(nw);
        return nw;
      };
      const w1 = a.walkAct ? lerpW(a.walkAct, tWalk) : 0;
      const w2 = a.gallopAct ? lerpW(a.gallopAct, tGal) : 0;
      const w3 = a.lowAct ? lerpW(a.lowAct, tLow) : 0;
      if (a.idleAct) {
        // 坐/趴时不要 idle 完全归零：权重为 0 的话混合器不再写骨骼，
        // 尾巴、耳朵、脚掌会冻在某一帧的僵硬姿态上（看起来像"四肢卡进模型"）。
        // 留一点 idle 权重，让没被 poseDog 覆盖的骨骼继续有呼吸感。
        const idleT = kPose > 0.02 ? 0.34 : Math.max(0, 1 - w1 - w2 - w3);
        const iw = a.idleAct.getEffectiveWeight();
        a.idleAct.setEffectiveWeight(iw + (idleT - iw) * Math.min(dt * 4, 1));
      }
      a.mixer.update(dt);
      if (a.bones && kPose > 0.02) poseDog(a, a.lieK, a.sitK);
      // 身体侧倾回正
      o.rotation.z += (0 - o.rotation.z) * Math.min(dt * 3, 1);
      let bob = 0;
      if (moving && mode === 'walk') bob = Math.sin(a.stepPhase * Math.PI * 4) * 0.055 * (a.h || 1.2) * 0.5;
      else if (moving && mode === 'run') bob = Math.abs(Math.sin(a.stepPhase * Math.PI * 2)) * 0.085 * (a.h || 1.2);
      const wantSY = (a.scaleY || o.scale.y) * (1 - 0.42 * a.lieK - 0.05 * a.sitK);
      o.scale.y += (wantSY - o.scale.y) * Math.min(dt * 3, 1);
      const bb = new THREE.Box3().setFromObject(o);
      o.position.y += (0.32 - bb.min.y + bob) * Math.min(dt * 6, 1);
    } else {
      o.position.y += (a.footY - o.position.y) * Math.min(dt * 2.2, 1);
    }
  }

  function updateWildlife(dt, t) {
    // 飞鸟（GLB 模型）：绕飞 / 停枝状态机
    for (let i = 0; i < birdModels.length; i++) {
      const b = birdModels[i], u = b.userData;
      const mixer = birdMixers[i];
      u.modeT = (u.modeT || 0) + dt;
      if (u.modeT > u.modeMax) {
        if (u.mode !== 'perch') {
          // 随机停到树枝上（树冠内随机枝点，休息一段时间）
          u.mode = 'perch';
          u.modeMax = 4 + Math.random() * 9;
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 6 + 1.5;
          u.perchX = Math.cos(a) * rr;
          u.perchY = 1.8 + Math.random() * 4.6;
          u.perchZ = Math.sin(a) * rr;
        } else {
          u.mode = 'fly';
          u.modeMax = 5 + Math.random() * 10;
        }
        u.modeT = 0;
      }
      if (u.mode === 'perch') {
        // 停在枝上：位置固定 + 轻微呼吸点头 + 翅膀收拢
        b.position.set(u.perchX, u.perchY + Math.sin(t * 0.5 + u.phase) * 0.025, u.perchZ);
        b.rotation.set(0, u.phase, Math.sin(t * 0.7 + u.phase) * 0.03);
        if (mixer) mixer.timeScale = 0.1;
      } else {
        const ang = u.phase + t * u.speed * u.dir;
        b.position.set(
          Math.cos(ang) * u.r,
          u.h + Math.sin(t * u.freq + u.phase * 2) * u.amp,
          Math.sin(ang) * u.r * 0.72
        );
        b.rotation.set(0, u.dir > 0 ? -ang + Math.PI / 2 : -ang - Math.PI / 2, 0);
        b.rotation.z = Math.sin(t * u.freq + u.phase) * 0.14;
        if (mixer) mixer.timeScale = 1;
      }
    }
    for (let i = 0; i < birdMixers.length; i++) birdMixers[i].update(dt);
    for (let i = 0; i < dogMixers.length; i++) dogMixers[i].mixer.update(dt);
    // 程序化海鸥（回退鸟）：轨道 + 停枝 + 真实扑翼
    for (let i = 0; i < gulls.length; i++) {
      const b = gulls[i], u = b.userData;
      u.modeT = (u.modeT || 0) + dt;
      if (u.modeT > u.modeMax) {
        if (u.mode !== 'perch') {
          u.mode = 'perch';
          u.modeMax = 4 + Math.random() * 9;
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 6 + 1.5;
          u.perchX = Math.cos(a) * rr;
          u.perchY = 1.8 + Math.random() * 4.6;
          u.perchZ = Math.sin(a) * rr;
        } else {
          u.mode = 'fly';
          u.modeMax = 5 + Math.random() * 10;
        }
        u.modeT = 0;
      }
      if (u.mode === 'perch') {
        b.position.set(u.perchX, u.perchY + Math.sin(t * 0.5 + u.phase) * 0.025, u.perchZ);
        b.rotation.set(0, u.phase, Math.sin(t * 0.7 + u.phase) * 0.03);
        (u.wings || []).forEach(function (w) { w.pivot.rotation.z = 0.06; }); // 翅膀收拢
      } else {
        const ang = u.phase + t * u.speed * u.dir;
        b.position.set(
          Math.cos(ang) * u.r,
          u.h + Math.sin(t * u.freq + u.phase * 2) * u.amp,
          Math.sin(ang) * u.r * 0.72
        );
        b.rotation.set(0, u.dir > 0 ? -ang + Math.PI / 2 : -ang - Math.PI / 2, 0);
        (u.wings || []).forEach(function (w) {
          w.pivot.rotation.z = Math.sin(t * u.flap + w.phase) * 0.55;
        });
      }
    }
    // 蝴蝶：fly(游走) / hover(悬停慢扇) / rest(停驻花簇，几乎不扇)
    for (let i = 0; i < butterflies.length; i++) {
      const b = butterflies[i], u = b.userData;
      u.modeT += dt;
      if (u.modeT > u.modeMax) {
        const rnd = Math.random();
        if (u.mode === 'fly') {
          u.mode = rnd < 0.5 ? 'hover' : 'rest';
        } else if (u.mode === 'hover') {
          u.mode = rnd < 0.65 ? 'fly' : 'rest';
        } else {
          u.mode = 'fly'; // 停够了重新起飞
        }
        u.modeT = 0;
        u.modeMax = 2.5 + Math.random() * 5;
        if (u.mode === 'rest') {
          // 停驻点：树冠内随机花簇（比游走范围更贴近树）
          u.restX = u.homeX + (Math.random() - 0.5) * u.wander * 0.9;
          u.restY = 1.8 + Math.random() * 3.2;
          u.restZ = u.homeZ + (Math.random() - 0.5) * u.wander * 0.9;
        }
      }
      let flapSpeed;
      if (u.mode === 'fly') {
        b.position.set(
          u.homeX + Math.sin(t * u.spd + u.phase) * u.wander,
          u.homeY + Math.sin(t * 0.8 + u.phase * 1.7) * 0.7,
          u.homeZ + Math.cos(t * u.spd * 0.8 + u.phase) * u.wander
        );
        flapSpeed = u.flap;
      } else if (u.mode === 'hover') {
        // 悬停：小范围盘旋 + 翅膀慢扇
        b.position.set(
          u.homeX + Math.sin(t * 0.9 + u.phase) * 0.35,
          u.homeY - 0.3 + Math.sin(t * 1.3 + u.phase) * 0.3,
          u.homeZ + Math.cos(t * 0.8 + u.phase) * 0.35
        );
        flapSpeed = u.flap * 0.45;
      } else {
        // 停驻花簇：几乎不动，翅膀极慢（像休息）
        b.position.set(
          u.restX + Math.sin(t * 0.3 + u.phase) * 0.04,
          u.restY + Math.sin(t * 0.4 + u.phase) * 0.05,
          u.restZ
        );
        flapSpeed = u.flap * 0.1;
      }
      (u.pivots || []).forEach(function (pv) {
        pv.pivot.rotation.y = Math.sin(t * flapSpeed + pv.phase) * 1.05 * pv.side;
      });
    }
  }

  /* ============================================================
     加载外部 GLB 樱花树模型
     ============================================================ */
  function loadTreeModel() {
    const loader = new THREE.GLTFLoader();
    const url = 'models/cherry_blossom_trees.glb?t=' + Date.now();

    // 校验式加载：fetch 完整 GLB 后按 GLB 头部校验总长度，防止传输截断
    // 只解析出部分 mesh；不完整则自动重试（服务器 18MB 偶发截断）
    function attempt(retryLeft) {
      const st0 = document.getElementById('model-state');
      if (st0 && !st0.classList.contains('ok')) st0.textContent = '正在加载 3D 模型… 下载解析中';
      fetch(url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) {
          const dv = new DataView(buf);
          const expected = dv.getUint32(12, true); // GLB: magic(4)+version(4)+length(4)
          if (buf.byteLength < expected || buf.byteLength < 1024) {
            throw new Error('GLB 不完整: ' + buf.byteLength + '/' + expected);
          }
          loader.parse(buf, '', function (gltf) {
            handleModelLoaded(gltf);
          }, function (e) { throw e; });
        })
        .catch(function (e) {
          console.error('[model] GLB 加载失败，剩余重试 ' + retryLeft + ':', e);
          if (retryLeft > 0) { setTimeout(function () { attempt(retryLeft - 1); }, 1000); }
          else { showLoadError(url, '3D 模型多次加载失败，请刷新重试'); }
        });
    }

    function handleModelLoaded(gltf) {
      treeRoot = gltf.scene;
      prepareModelMaterials(treeRoot);

      // 该 GLB 含 3 棵不同大小的树（structure* + foliage* 成对）：
      // 自动提取包围盒最大的一棵作为主树，其余两棵作为背景树
      const trees = collectTrees(treeRoot);
      if (!trees || trees.length === 0) { showLoadError(url, '未找到树结构节点'); return; }

      // 选包围盒最高的一棵为主树
      let best = trees[0];
      trees.forEach(function (t) { if (t.size.y > best.size.y) best = t; });

      // 主树归一化：树高 -> TREE_H，底部落于 y=0，中心 x/z 居中
      const s = TREE_H / best.size.y;
      treeModel = new THREE.Group();
      treeModel.add(treeRoot);
      treeRoot.scale.setScalar(s);
      treeRoot.position.x = -best.center.x * s;
      treeRoot.position.z = -best.center.z * s;
      treeRoot.position.y = -best.minY * s;
      scene.add(treeModel);

      // 移除其余树的节点（它们将被重新摆为背景树）
      trees.forEach(function (t) {
        if (t === best) return;
        if (t.struct.parent) t.struct.parent.remove(t.struct);
        t.foliages.forEach(function (f) { if (f.parent) f.parent.remove(f); });
      });

      // 主树阴影 & 性能
      treeRoot.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = true;
        }
      });

      // 背景樱花树：用 GLB 里其余小树克隆出 10 棵，大小错落环绕主树后方
      //（主树已放大到 TREE_H=14，背景树 3.5~8.5 世界单位，形成"主树突出+自然群落"）
      const subTrees = [];
      trees.forEach(function (t) { if (t !== best) subTrees.push(t); });
      if (subTrees.length === 0) subTrees.push(best); // 若只有一棵，克隆主树做背景
      const bgTotal = 10;
      const camAng = Math.atan2(1.95, 1.55);
      const taken = [];
      for (let k = 0; k < bgTotal; k++) {
        const t = subTrees[k % subTrees.length];
        const sub = new THREE.Group();
        sub.add(t.struct.clone(true));
        t.foliages.forEach(function (f) { sub.add(f.clone(true)); });
        // 背景树高度错落：40% 大（6~8.5），40% 中（4.2~5.8），20% 小（3.2~4.2）
        const r = Math.random();
        let targetH = r < 0.4 ? 6 + Math.random() * 2.5 : (r < 0.8 ? 4.2 + Math.random() * 1.6 : 3.2 + Math.random() * 1);
        // 分布不规则：环向大随机偏移 + 半径随机，天然疏密不均
        let ang = Math.random() * Math.PI * 2;
        let dist = 12 + Math.random() * 7;
        let guard = 0;
        while (guard < 20) {
          guard++;
          let ok = true;
          for (const tk of taken) {
            const dx = Math.cos(ang) * dist - Math.cos(tk.ang) * tk.dist;
            const dz = Math.sin(ang) * dist - Math.sin(tk.ang) * tk.dist;
            if (dx * dx + dz * dz < 6.5 * 6.5) { ok = false; break; } // 最小间距防重叠
          }
          if (ok) break;
          ang = Math.random() * Math.PI * 2;
          dist = 12 + Math.random() * 7;
        }
        taken.push({ ang: ang, dist: dist });
        // 相机前方扇区：放更远更矮（不挡主树视线）
        let dAng = Math.abs(((ang - camAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dAng < Math.PI * 0.32) {
          dist = Math.max(dist, 20 + Math.random() * 4);
          targetH = Math.min(targetH, 3 + Math.random() * 1.6);
        }
        const ss = targetH / t.size.y;
        sub.scale.setScalar(ss);
        sub.position.x = Math.cos(ang) * dist;
        sub.position.z = Math.sin(ang) * dist;
        sub.position.y = -t.minY * ss;
        sub.rotation.y = Math.random() * Math.PI * 2;
        sub.userData.height = targetH;
        sub.traverse(function (o) {
          if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true; }
        });
        scene.add(sub);
        backgroundTrees.push(sub);
      }
      console.log('[sakura-model] background trees placed: ' + backgroundTrees.length);

      // 收集花簇风吹摆动器：主树 foliage + 背景树 clone foliage（每帧错相位微摆）
      foliageSwayers = [];
      trees.forEach(function (t) {
        t.foliages.forEach(function (f) { foliageSwayers.push(makeSwayer(f)); });
      });
      backgroundTrees.forEach(function (g) {
        g.children.forEach(function (ch) {
          if (/^foliage/.test(ch.name)) foliageSwayers.push(makeSwayer(ch));
        });
      });
      console.log('[sakura-model] foliage swayers: ' + foliageSwayers.length);

      // 测量主树包围盒
      const box = new THREE.Box3().setFromObject(treeModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      modelBox = { size: size, center: center };

      // 适配相机、花瓣范围与地面细节
      fitViewsToModel();
      buildGroundDetails();
      try { buildWildlife(); } catch (e) { console.error('[wildlife] 构建失败（不影响主流程）:', e); }
      buildDogs();
      reseedPetals();
      applyPetalTint();   // 首次加载就按当前季节/天气定色（否则默认材质色=白，花瓣会一片惨白）
      showReadyState();

      // 调试：暴露状态
      window.__dbg = {
        treeModel: treeModel,
        size: size,
        center: center,
        scale: s,
        meshCount: (function () { let c = 0; treeRoot.traverse(function (o) { if (o.isMesh) c++; }); return c; })(),
        backgroundTrees: backgroundTrees.length
      };
      console.log('[sakura-model] loaded, size=', size.toArray(), 'scale=', s, 'meshes=', window.__dbg.meshCount, 'bgTrees=', backgroundTrees.length);
    }

    attempt(4);
  }

  /* ============================================================
     收集 GLB 中的每棵树分组（structure* 配 foliage*），返回
     [{struct, foliages, size, center, minY}]（不移动任何节点）
     ============================================================ */
  function collectTrees(root) {
    let sceneRoot = null;
    root.traverse(function (o) {
      if (o.name === 'GLTF_SceneRootNode') sceneRoot = o;
    });
    if (!sceneRoot) return [];

    const structs = [], foliages = [];
    sceneRoot.children.forEach(function (c) {
      if (/^structure/.test(c.name)) structs.push(c);
      if (/^foliage/.test(c.name)) foliages.push(c);
    });
    if (structs.length === 0) return [];

    // structure 名后缀 n 配 foliage 名后缀 n+1（florasynth 导出规律）
    const num = function (n) { const m = n.match(/_(\d+)$/); return m ? parseInt(m[1], 10) : -1; };
    return structs.map(function (s) {
      const sn = num(s.name);
      const f = foliages.filter(function (x) { return num(x.name) === sn + 1; });
      const box = new THREE.Box3();
      [s].concat(f).forEach(function (o) { box.expandByObject(o); });
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      return { struct: s, foliages: f, size: size, center: center, minY: box.min.y };
    });
  }

  /* ============================================================
     模型材质适配：保留作者 PBR 贴图，只补渲染设置
     Jagobo 花簇贴图为"黑底粉花"RGBA，导出时 alphaMode=OPAQUE，
     必须启用 alpha 裁剪，否则黑底会整块覆盖树冠
     ============================================================ */
  function prepareModelMaterials(root) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function (mat) {
        if (!mat) return;
        const isFoliage = mat.name && /foliage/i.test(mat.name);
        if (mat.transparent || mat.alphaMap || isFoliage) {
          mat.side = THREE.DoubleSide;
          mat.transparent = true;
          mat.alphaTest = 0.55;      // 裁剪花簇黑底
          mat.depthWrite = true;     // 花簇写深度：避免半透明叠加成一层粉雾
          // 收集花簇材质（季节染色用；去重）——按透明+alpha 裁剪特征，不依赖命名
          if (foliageMatList.indexOf(mat) === -1) {
            foliageMatList.push(mat);
          }
        }
        mat.needsUpdate = true;
      });
    });
  }

  /* ============================================================
     相机视角：按模型实际尺寸动态计算
     ============================================================ */
  function fitViewsToModel() {
    if (!modelBox) return;
    const h = TREE_H;
    const r = Math.max(modelBox.size.x, modelBox.size.z) * (TREE_H / modelBox.size.y) * 0.6;
    const midY = h * 0.45;

    VIEWS = {
      full:  { pos: [r * 1.55, h * 0.62, r * 1.95], tgt: [0, midY, 0] },
      mid:   { pos: [r * 1.0, h * 0.55, r * 1.25],  tgt: [0, midY, 0] },
      close: { pos: [r * 0.55, h * 0.42, r * 0.75], tgt: [0, midY, 0] }
    };

    // 平滑飞回全景
    flying = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP: new THREE.Vector3(VIEWS.full.pos[0], VIEWS.full.pos[1], VIEWS.full.pos[2]),
      toT: new THREE.Vector3(VIEWS.full.tgt[0], VIEWS.full.tgt[1], VIEWS.full.tgt[2]),
      t: 0
    };
  }

  /* ============================================================
     飘落花瓣（cannon.js 物理引擎驱动）：
     · 树冠花瓣池——花瓣"停"在花簇上，风力超过阈值被吹落（风起花落，不会秃）
     · 空中花瓣——真实物理：重力 / 风场力 / 空气阻尼 / 地面碰撞
     · 落地堆积——碰撞地面后停留数秒淡出，重生回树冠
     · 每棵树（主树 + 6 背景树）独立花瓣池，棵棵都持续有花瓣
     ============================================================ */
  function buildPhysics() {
    if (typeof CANNON === 'undefined') return; // CDN 失败 → 降级 CPU 模拟
    physicsWorld = new CANNON.World();
    physicsWorld.gravity.set(0, -SEASON_GRAVITY[currentSeason], 0);
    physicsWorld.broadphase = new CANNON.NaiveBroadphase();
    // 地面静态碰撞体（y=0，法线朝上）
    groundBody = new CANNON.Body({ mass: 0 });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    physicsWorld.addBody(groundBody);
  }

  function buildPetals() {
    // Basic 材质：薄片花瓣不受镜面高光过曝影响（Standard 在正对阳光时会烧成白片）
    const mat = new THREE.MeshBasicMaterial({
      map: getPetalTexture(), transparent: true,
      alphaTest: 0.42, side: THREE.DoubleSide, depthWrite: false
    });
    petalSystem = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.26, 0.26), mat, MAX_PETALS);
    petalSystem.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    petalSystem.frustumCulled = false;
    scene.add(petalSystem);
    petalSystem.userData.petals = [];
    for (let i = 0; i < MAX_PETALS; i++) {
      const p = makePetalState(i < DEFAULT_PETALS);
      petalSystem.userData.petals.push(p);
      if (physicsWorld) {
        // 每个花瓣一个常驻刚体（树冠/落地时 STATIC，空中时 DYNAMIC）
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(new CANNON.Sphere(0.12));
        body.type = CANNON.Body.STATIC;
        body.linearDamping = 0.10;   // 空气阻力：保留一点横向阻力，但下落要干脆，不再长时间悬在半空
        body.angularDamping = 0.30;
        body.position.set(p.cx, p.cy, p.cz);
        physicsWorld.addBody(body);
        petalBodies.push(body);
      }
    }
  }

  // 花瓣来源树冠（仅主树）
  let petalSources = [];

  function collectPetalSources() {
    petalSources = [];
    const rMain = Math.max(modelBox.size.x, modelBox.size.z) * 0.5;
    petalSources.push({ x: 0, z: 0, r: rMain * 0.8, h: TREE_H * 0.92 }); // 主树
    backgroundTrees.forEach(function (g) {
      const bb = new THREE.Box3().setFromObject(g);
      const sz = bb.getSize(new THREE.Vector3());
      const c = bb.getCenter(new THREE.Vector3());
      petalSources.push({ x: c.x, z: c.z, r: Math.max(sz.x, sz.z) * 0.45, h: sz.y * 0.9 });    });
  }

  // 每片花瓣固定绑定一棵树（主树 45% + 背景树 55% 均分）——每棵树都持续有花瓣
  function pickSourceIdx() {
    if (petalSources.length <= 1) return 0;
    if (Math.random() < 0.45) return 0;
    return 1 + ((Math.random() * (petalSources.length - 1)) | 0);
  }

  // 树冠停靠点：花瓣"停"在花簇边缘（冠中部~顶部）
  function crownSpot(p) {
    if (!petalSources.length) return; // 防御：树源未就绪时跳过
    const src = petalSources[p.srcIdx] || petalSources[0];
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * src.r * 0.26;
    p.cx = src.x + Math.cos(a) * rr;
    p.cz = src.z + Math.sin(a) * rr;
    p.cy = src.h * (0.56 + Math.random() * 0.26);
    p.crownT = 0;
    p.crownLife = 12 + Math.random() * 12;   // 错峰：每片挂树冠的时间不同，避免整批同时脱枝
  }

  function makePetalState(active) {
    return {
      active: active,
      srcIdx: 0,
      state: 'crown',          // crown=停树冠(待风吹落) / air=空中物理 / ground=落地堆积
      groundT: 0,
      groundLife: 7 + Math.random() * 9,
      crownT: 0,
      crownLife: 12 + Math.random() * 12,
      cx: 0, cy: 4, cz: 0,     // 树冠停靠点
      gx: 0, gz: 0,            // 落地位置
      phase: Math.random() * Math.PI * 2,
      rotSpeed: 0.5 + Math.random() * 1.2,
      rotSpeed2: (Math.random() - 0.5) * 0.9,
      swayAmp: 0.2 + Math.random() * 0.45,
      scale: 0.95 + Math.random() * 1.1,
      // 湍流多频随机（每片花瓣的气流搅动频率不同 → 飘落更无序真实）
      swirlF1: 1.4 + Math.random() * 2.6,
      swirlF2: 0.7 + Math.random() * 2.2,
      swirlF3: 2.2 + Math.random() * 3.2
    };
  }

  function reseedPetals() {
    if (!modelBox) return;
    collectPetalSources();
    const petals = petalSystem.userData.petals;
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      p.srcIdx = pickSourceIdx();
      p.state = 'crown';
      crownSpot(p);
      const b = petalBodies[i];
      if (b) { b.type = CANNON.Body.STATIC; b.velocity.set(0, 0, 0); b.position.set(p.cx, p.cy, p.cz); }
    }
  }

  // 风将花瓣从树冠吹落：激活刚体，初始速度沿风方向
  function releasePetal(p, i) {
    const b = petalBodies[i];
    if (!b) return;
    p.state = 'air';
    b.type = CANNON.Body.DYNAMIC;
    b.mass = SEASON_MASS[currentSeason];
    b.updateMassProperties();
    b.position.set(p.cx, p.cy, p.cz);
    const gust = 1 + Math.sin(clock.getElapsedTime() * 0.5 + p.phase) * 0.5;
    b.velocity.set(
      (0.4 + Math.random() * 0.8) * gust * windStrength,
      -(0.85 + Math.random() * 0.75),
      (Math.random() - 0.5) * 0.8 * windStrength
    );
    b.angularVelocity.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
  }

  let frameCount = 0;           // 渲染帧计数（调试统计用）

  function updatePetals(dt, t) {
    // 物理步进（cannon 世界）
    if (physicsWorld) physicsWorld.step(Math.min(dt, 0.05));

    const petals = petalSystem.userData.petals;
    const d = new THREE.Object3D();
    const isWinter = currentSeason === 'winter';

    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      const b = petalBodies[i];
      if (!p.active) {
        d.scale.setScalar(0);
        d.position.set(0, -60, 0);
        d.updateMatrix();
        petalSystem.setMatrixAt(i, d.matrix);
        continue;
      }

      if (p.state === 'crown') {
        // 停靠在花簇上：跟随树冠轻微摇摆；风力超过阈值时按概率吹落
        const sw = Math.sin(t * 0.4 + p.phase) * 0.3 * windStrength;
        d.position.set(p.cx + sw, p.cy + Math.sin(t * 0.55 + p.phase * 2) * 0.18, p.cz);
        d.rotation.set(
          Math.sin(t * p.rotSpeed + p.phase) * 0.4,
          0,
          Math.sin(t * p.rotSpeed2 + p.phase * 2) * 0.4
        );
        d.scale.setScalar(p.scale * 0.30);   // 挂在树冠上时缩小，别让白点盖住树本身的花
        d.updateMatrix();
        petalSystem.setMatrixAt(i, d.matrix);

        // 释放：按"每秒固定比例"脱枝 —— 用 exp 换算到本帧概率，低帧率也不会变慢
        // 雨天把脱枝率压到三分之一：雨里还满天飘花瓣/雪花会显得很假
        const blow = Math.min(windStrength, 3);
        const relRate = (currentWeather === 'rain') ? 0.030
                      : (currentWeather === 'cloudy') ? 0.062 : 0.085;
        if (Math.random() < 1 - Math.exp(-relRate * blow * dt)) {
          releasePetal(p, i);
        }
      } else if (p.state === 'air') {
        if (b) {
          // 风场力：风力越大水平推力越强（大风时花瓣明显加速横飞、整体更快）
          const gust = Math.sin(t * 0.6 + p.phase) * 0.6 + 1;
          const windPow = 0.012 * (1 + windStrength * 0.85);
          b.applyForce(new CANNON.Vec3(
            (0.9 + Math.random() * 0.6) * gust * windStrength * windPow,
            0,
            Math.sin(t * 0.33 + p.phase * 1.7) * 0.3 * windStrength * windPow
          ), b.position);
          // 湍流：每帧多频无序搅动（三频叠加，幅值随风力；不同花瓣频率各异 → 轨迹自然无序）
          b.applyForce(new CANNON.Vec3(
            (Math.sin(t * p.swirlF1 + p.phase * 3.1) * 0.6 + Math.sin(t * p.swirlF3 + p.phase * 5.2) * 0.4) * windStrength * 0.055,
            (Math.sin(t * p.swirlF1 * 0.7 + p.phase * 7.3) * 0.45 + Math.sin(t * p.swirlF2 * 0.5 + p.phase * 2.1) * 0.3) * 0.006,
            (Math.cos(t * p.swirlF2 * 0.9 + p.phase * 2.7) * 0.55 + Math.sin(t * p.swirlF3 * 1.1 + p.phase * 1.3) * 0.35) * windStrength * 0.05
          ), b.position);
          // 大风时下落略加快（气流下压 + 视觉上整体更快）
          if (windStrength > 1.4) {
            b.applyForce(new CANNON.Vec3(0, -windStrength * 0.012, 0), b.position);
          }
          d.position.set(b.position.x, b.position.y, b.position.z);
          // 沿速度方向倾转（真实花瓣被风托着斜飞）+ 纸片翻转
          const v = b.velocity;
          d.rotation.set(
            Math.atan2(Math.abs(v.z), Math.max(Math.abs(v.y), 0.5)) * (v.z >= 0 ? -1 : 1) * 0.6 + Math.sin(t * p.rotSpeed + p.phase) * 0.4,
            isWinter ? 0 : Math.sin(t * 0.35 + p.phase) * 0.6,
            Math.atan2(v.x, Math.max(Math.abs(v.y), 0.5)) * 0.5 + Math.sin(t * p.rotSpeed2 + p.phase * 2) * 0.5
          );
          d.scale.setScalar(p.scale);
          d.updateMatrix();
          petalSystem.setMatrixAt(i, d.matrix);

          // 落地：与地面碰撞 → 停住堆积
          if (b.position.y <= 0.3) {
            b.velocity.set(0, 0, 0);
            b.angularVelocity.set(0, 0, 0);
            b.type = CANNON.Body.STATIC;
            p.state = 'ground';
            p.groundT = 0;
            p.groundLife = isWinter ? 20 + Math.random() * 14 : 7 + Math.random() * 9;
            p.gx = b.position.x;
            p.gz = b.position.z;
            b.position.y = 0.3;
          }
        } else {
          // 无物理引擎降级（CDN 失败）：简单 CPU 下落
          p.cx += Math.sin(t * p.swayAmp + p.phase) * 0.25 * dt * windStrength;
          p.cy -= (isWinter ? 1.1 : 2.0) * dt;
          d.position.set(p.cx, p.cy, p.cz);
          d.rotation.set(Math.sin(t * p.rotSpeed + p.phase) * 0.85, 0, Math.sin(t * p.rotSpeed2 + p.phase * 2) * 0.85);
          d.scale.setScalar(p.scale);
          d.updateMatrix();
          petalSystem.setMatrixAt(i, d.matrix);
          if (p.cy <= 0.3) { p.state = 'ground'; p.groundT = 0; p.groundLife = isWinter ? 20 + Math.random() * 14 : 7 + Math.random() * 9; p.gx = p.cx; p.gz = p.cz; }
        }
      } else { // ground
        p.groundT += dt;
        // 强风卷起地面花瓣（真实：落下的花瓣被大风重新吹回空中）
        if (b && windStrength > 1.2 && p.groundT > 1.5 && Math.random() < windStrength * 0.00005) {
          b.type = CANNON.Body.DYNAMIC;
          p.state = 'air';
          b.position.y = 0.35;
          b.velocity.set(
            (Math.random() - 0.2) * windStrength * 2.2,
            0.8 + Math.random() * 1.1,
            (Math.random() - 0.5) * windStrength * 1.6
          );
        }
        // 多层叠压：新落花瓣浮在表层，越旧越沉入下层（真实堆积质感）
        // 稳定伪随机偏移（避免每帧抖动）
        const ox = Math.sin(p.phase * 31.7) * 0.022;
        const oz = Math.cos(p.phase * 17.3) * 0.022;
        const orot = Math.sin(p.phase * 9.7) * 0.55;
        const lyr = Math.min(Math.floor(p.groundT / 2.4), 3);   // 层 0=新(表) 3=旧(底)
        d.position.set(p.gx + ox, 0.3 + (3 - lyr) * 0.013 + Math.sin(p.groundT * 2 + p.phase) * 0.004, p.gz + oz);
        d.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.25, 0, Math.sin(p.groundT * 0.7 + p.phase) * 0.5 + orot);
        const fade = p.groundT > p.groundLife - 1.2 ? Math.max(0, 1 - (p.groundT - (p.groundLife - 1.2))) : 1;
        d.scale.setScalar(p.scale * fade * (1 - lyr * 0.04));   // 底层略小被压
        d.updateMatrix();
        petalSystem.setMatrixAt(i, d.matrix);

        // 停留结束 → 重生回原树冠（绑定同一棵树）
        if (p.groundT >= p.groundLife) {
          if (b) { b.type = CANNON.Body.STATIC; b.velocity.set(0, 0, 0); }
          p.state = 'crown';
          crownSpot(p);
          if (b) b.position.set(p.cx, p.cy, p.cz);
        }
      }
    }
    petalSystem.instanceMatrix.needsUpdate = true;
    // 调试钩子（每帧更新，供外部校验物理/粒子状态）
    frameCount++;
    if (frameCount % 20 === 0) {
      let c = 0, a = 0, g = 0;
      for (let i = 0; i < petals.length; i++) {
        const s = petals[i].state;
        if (s === 'crown') c++; else if (s === 'air') a++; else if (s === 'ground') g++;
      }
      window.__sakuraDebug = {
        physics: !!physicsWorld,
        crown: c, air: a, ground: g,
        weather: currentWeather, season: currentSeason,
        rainVisible: !!(rainSystem && rainSystem.visible),
        wind: windStrength
      };
      // DOM 通道（跨执行世界可读）：页面内调试 div + 标题
      try {
        const dbgStr = 'phy=' + (physicsWorld ? 1 : 0) + ' c=' + c + ' a=' + a + ' g=' + g +
          ' wx=' + currentWeather + ' sn=' + currentSeason + ' w=' + windStrength.toFixed(2) +
          ' cld=' + (cloudSprites ? cloudSprites.filter(function (x) { return x.visible; }).length : -1);
        document.title = 'SAKURA';
        // 调试文字已隐藏（用户不需要看到）
        // let el = document.getElementById('dbg');
        // if (!el) {
        //   el = document.createElement('div');
        //   el.id = 'dbg';
        //   el.style.cssText = 'position:fixed;left:8px;bottom:34px;z-index:9999;color:#fff;background:rgba(0,0,0,.65);font:12px monospace;padding:2px 8px;border-radius:4px;';
        //   document.body.appendChild(el);
        // }
        // el.textContent = dbgStr;
      } catch (e) { /* 忽略 */ }
    }
  }

  /* ============================================================
     相机视角
     ============================================================ */
  let VIEWS = {
    full:  { pos: [11, 6.4, 13], tgt: [0, 4.2, 0] },
    mid:   { pos: [7, 5.2, 8.4], tgt: [0, 4.4, 0] },
    close: { pos: [3.8, 3.6, 5], tgt: [0.4, 3.2, 0] }
  };

  function flyToView(name) {
    const v = VIEWS[name];
    if (!v) return;
    flying = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP: new THREE.Vector3(v.pos[0], v.pos[1], v.pos[2]),
      toT: new THREE.Vector3(v.tgt[0], v.tgt[1], v.tgt[2]),
      t: 0
    };
  }

  // 飞到任意世界坐标（互动热点用）：pos / lookAt 为 [x,y,z]，dur 为秒
  function flyToPoint(pos, lookAt, dur) {
    flying = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP: new THREE.Vector3(pos[0], pos[1], pos[2]),
      toT: new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]),
      t: 0,
      speed: Math.max(0.2, Math.min(3, 1 / Math.max(0.35, dur || 1.2)))
    };
  }

  function updateFlying(dt) {
    if (!flying) return;
    flying.t += dt * (flying.speed || 0.85);
    const k = Math.min(1, flying.t);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(flying.fromP, flying.toP, e);
    controls.target.lerpVectors(flying.fromT, flying.toT, e);
    controls.update();
    if (k >= 1) flying = null;
  }

  /* ============================================================
     动画循环
     ============================================================ */
  // 花簇摆动器：记录节点基线旋转，风大时整体轻微摇曳（绕根部中心）
  function makeSwayer(obj) {
    return {
      obj: obj,
      baseX: obj.rotation.x, baseY: obj.rotation.y, baseZ: obj.rotation.z,
      phase: Math.random() * Math.PI * 2,
      freq: 0.32 + Math.random() * 0.45,
      amp: 0.032 + Math.random() * 0.04
    };
  }

  function updateFoliage(t) {
    for (let i = 0; i < foliageSwayers.length; i++) {
      const s = foliageSwayers[i];
      // 风的传播延迟：距树干越远的枝叶摆动越滞后（风从一侧掠过树冠的波状效果）
      const dist = s.obj ? Math.sqrt(s.obj.position.x * s.obj.position.x + s.obj.position.z * s.obj.position.z) : 0;
      const delay = Math.min(dist * 0.1, 0.8);
      const wind = windStrength;
      // 主摆动（带延迟）+ 高频轻颤（叶片被气流扰动的不规则细碎抖动）
      s.obj.rotation.x = s.baseX + Math.sin(t * s.freq * 0.6 + s.phase * 1.3 - delay) * s.amp * 0.55 * wind +
        Math.sin(t * 3.3 + s.phase * 4) * 0.0035 * wind;
      s.obj.rotation.z = s.baseZ + Math.sin(t * s.freq + s.phase - delay * 1.3) * s.amp * wind +
        Math.sin(t * 2.7 + s.phase * 3.1) * 0.003 * wind;
      // 风停时残余微摆（衰减至零，不突变）
      s.obj.rotation.y = (s.baseY || 0) + Math.sin(t * 0.9 + s.phase) * s.amp * 0.3 * Math.min(wind, 1.5);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.getElapsedTime();

    if (animating) {
      updatePetals(dt, t);
      updateFoliage(t);
      // 整树极轻微呼吸摆动（微风，幅度极小，不破坏模型姿态）
      if (treeModel) {
        treeModel.rotation.z = Math.sin(t * 0.28) * 0.0012 * windStrength;
        treeModel.rotation.x = Math.sin(t * 0.2 + 1.3) * 0.0008 * windStrength;
      }
    }

    updateTimeLerp(dt);
    updateSky(dt);
    updateFlying(dt);
    updateClouds(dt);
    updateSea(dt, t);
    updateRain(dt, t);
    updateWildlife(dt, t);
    updateStars(t);
    updateDust(dt, t);
    updateRealtime(dt);
    updateDogs(dt, t);
    controls.update();
    renderer.render(scene, camera);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ============================================================
     状态提示
     ============================================================ */
  function showReadyState() {
    const h = document.getElementById('model-state');
    if (h) { h.textContent = '模型已加载 · 樱花树 Cherry Blossom Trees (CC BY) · 小狗 Quaternius (CC0)'; h.classList.add('ok'); }
  }

  function showLoadError(url, err) {
    const h = document.getElementById('model-state');
    if (h) {
      h.textContent = '模型加载失败：' + url + ' —— ' + (err && err.message ? err.message : err);
      h.classList.add('err');
    }
  }

  /* ============================================================
     UI
     ============================================================ */
  function setupUI() {
    const petalSlider = document.getElementById('petal-count');
    const petalLabel = document.getElementById('petal-count-label');
    petalSlider.addEventListener('input', function () {
      const count = Number(petalSlider.value);
      petalLabel.textContent = count;
      const petals = petalSystem.userData.petals;
      for (let i = 0; i < petals.length; i++) petals[i].active = i < count;
    });

    const windSlider = document.getElementById('wind-strength');
    const windLabel = document.getElementById('wind-label');
    windSlider.addEventListener('input', function () {
      windStrength = Number(windSlider.value);
      windLabel.textContent = windStrength.toFixed(1);
    });

    document.querySelectorAll('[data-view]').forEach(function (btn) {
      btn.addEventListener('click', function () { flyToView(btn.dataset.view); });
    });

    document.querySelectorAll('[data-time]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        realtimeMode = false;
        document.querySelectorAll('[data-realtime]').forEach(function (b) { b.classList.remove('active'); });
        applyTimeMode(btn.dataset.time);
      });
    });

    document.querySelectorAll('[data-realtime]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        realtimeMode = !realtimeMode;
        btn.classList.toggle('active', realtimeMode);
        if (realtimeMode) {
          applyRealtimeNow();
        } else {
          // 退出真实时间：恢复手动昼夜与固定天体位置
          applyTimeMode(currentTimeMode === 'day' ? 'day' : 'night');
          updateCelestial();
        }
      });
    });

    document.querySelectorAll('[data-season]').forEach(function (btn) {
      btn.addEventListener('click', function () { applySeason(btn.dataset.season); });
    });

    document.querySelectorAll('[data-weather]').forEach(function (btn) {
      btn.addEventListener('click', function () { applyWeather(btn.dataset.weather); });
    });

    document.getElementById('btn-reset').addEventListener('click', function () { flyToView('full'); });

    const btnAnim = document.getElementById('btn-anim');
    btnAnim.addEventListener('click', function () {
      animating = !animating;
      btnAnim.classList.toggle('active', animating);
    });

    document.getElementById('btn-fullscreen').addEventListener('click', function () {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });

    const panel = document.getElementById('control-panel');
    document.getElementById('panel-toggle').addEventListener('click', function () {
      const collapsed = panel.classList.toggle('collapsed');
      this.textContent = '☰';
      this.style.opacity = collapsed ? '0.55' : '1';
      this.setAttribute('aria-label', collapsed ? '展开控制台' : '收起控制台');
    });
  }

  /* ============================================================
     file:// 协议检测（GLB 需经 HTTP 服务器加载）
     ============================================================ */
  function checkProtocol() {
    if (location.protocol === 'file:') {
      const mask = document.getElementById('file-mask');
      if (mask) mask.classList.add('show');
    }
  }

  checkProtocol();
  init();
  animate();

  /* 对外接口：供 js/portal.js（互动热点 / 礼物系统）调用。
     只暴露引用与少量方法，不改变原有逻辑。 */
  window.SakuraCore = {
    THREE: THREE,
    TREE_H: TREE_H,
    get scene() { return scene; },
    get camera() { return camera; },
    get renderer() { return renderer; },
    get controls() { return controls; },
    get treeModel() { return treeModel; },
    get dogActors() { return dogActors; },
    get butterflies() { return butterflies; },
    get birds() { return birdModels.concat(gulls); },
    get sunMesh() { return sunMesh; },
    get moonMesh() { return moonMesh; },
    get windStrength() { return windStrength; },
    get currentSeason() { return currentSeason; },
    get currentWeather() { return currentWeather; },
    flyToPoint: flyToPoint,
    isReady: function () { return !!treeModel; },
    setControlsEnabled: function (v) { if (controls) controls.enabled = !!v; },
    get cameraDistance() { return camera ? camera.position.distanceTo(controls.target) : 0; }
  };
})();
