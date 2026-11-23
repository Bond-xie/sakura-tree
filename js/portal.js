/* ============================================================
   互动热点 + 礼物系统（独立于 model-main.js）
   ------------------------------------------------------------
   · 热点是 DOM 层，每帧把 3D 世界坐标投影成屏幕坐标（不用 raycaster）
   · 点任意一个热点 → 镜头飞近 → 内容卡 → 点「下一步」→ 礼物盒 → 礼物卡
   · 每个热点独立完成、独立给礼物，互不阻塞（就是你要的"分支"）
   · 所有文案集中在 CONTENT，写完内容只需改这一块
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     1) 内容区：只改这里
     · body = 纸卡正文（\n 分段）
     · gift = 这一关送的礼物（读完点「下一步」直接开礼物盒）
     · words 现在不再使用（拼花瓣游戏已取消），留着方便以后恢复
     ============================================================ */
  var CONTENT = {

    /* ---------- 春天 ---------- */
    mem1: {
      no: '01',
      label: '春晴',
      date: '2026年5月5日 · 春 · 晴',
      title: '点亮火花',
      body: '在这天我们的抖音火苗正式点亮啦，这簇小小的火花，不只是屏幕上的连续天数，更是我们的每日想念的标点符号。往后的日子需要好好的干饭，和我们的小火苗一样当一个爱吃鬼',
      words: ['火', '苗', '点', '亮', '了'],
      gift: { name: '跳舞骷髅', desc: '会跳舞的骷髅摆件，摆在桌上。' }
    },

    wtr1: {
      no: '05',
      label: '春阴',
      date: '2026年3月15日 · 春 · 阴',
      title: '孕育生命',
      body: '这是我们第一次一起孕育生命，是两条可爱的鱼，一条叫卧龙，一条叫凤雏。名字虽然听着不太聪明，但是确实也是两条笨鱼，最终引恨西北，第一条去世没多久，第二条也跟着殉情而去，却也算是浪漫，虽然死因可能是中毒。所以你解锁了一个刷刷刷，嘻嘻。',
      words: ['卧', '龙', '凤', '雏'],
      gift: { name: '电动牙刷', desc: '刷刷刷，嘻嘻。' }
    },

    rn1: {
      no: '09',
      label: '春雨',
      date: '2026年4月11日 · 春 · 雨',
      title: '勇闯洗脚城',
      body: '这是我人生第一次去洗脚城，居然是跟着你一起去的。那天，夏日炎炎，我们吃完牛腩粉，问道要去哪里，我只是随口说了去皇足轩，结果两个人真的去了，我没去过这种地方，第一次进去，我还是有点紧张，害羞，因为从来没有其他人碰过我的JIO，反观你，却显得格外从容，闲庭信步，好像对这里的一切都熟门熟路。我还忍不住开玩笑地调侃你：一看你就是老手了，经常去洗脚城吧，把会员卡借我用用，现在想起来，也是一个有趣的第一次经历呢，因为和你在一起，好像总会发生一些意想不到的小故事。原本平平无奇的一天，因为一个突如其来的决定，就变成了值得记录的小小纪念，OS：染上脚气啦',
      words: ['勇', '闯', '洗', '脚', '城'],
      gift: { name: '为你无限洗JIO', desc: '无限次。' }
    },

    /* ---------- 夏天 ---------- */
    mem2: {
      no: '02',
      label: '夏晴',
      date: '2025年8月13日 · 夏 · 晴',
      title: '初次见面',
      body: '在这天，我们第一次见面，第一次坐出国的飞机，就因为延误，导致下午才到办公室，当我拿着行李，踏进办公室，注意到了角落的一个姑娘，身穿黑色蓬松长裙，黑色袜子，黑色小皮鞋，带着一个长长的耳坠，忽然一愣，那是第一次见面的情形，或许并没有注意到我，临近下班的时候，突然有个清脆的声音，喊道吃饭啦，那是第一句话，也是缘分的开始，愿我们的缘分长长久久，永不分离。',
      words: ['第', '一', '次', '见', '面'],
      gift: { name: '花花毛毯', desc: '还在加急制作中，因为手脚比较笨。' }
    },

    wtr2: {
      no: '06',
      label: '夏阴',
      date: '2026年8月31日 · 夏 · 阴',
      title: '雾山之旅',
      body: '这是我们第一次的短途旅行，恰逢马来西亚的国庆日，也是我们第一次真正意义上的一起出发，去看看不一样的风景。我们一起去了云顶天宫，坐了刺激的过山车，紧紧握着彼此的手，在失重与尖叫中感受心跳加速的快乐；一起体验了震撼的5D电影，仿佛身临其境；一起穿着雨衣，在雨中漫步、拍照，把那些湿漉漉的瞬间，也变成了属于我们的独家回忆。我们还一起走进赌场，看着里面纸醉金迷的世界，虽然我们好像都没什么感觉，哈哈。\n这一路，我们一起坐了飞机，一起坐了大巴，经历了漫长的路程，坐了好久好久的车。也算是第一次真正意义上的一起跨越山河，奔赴一场属于我们的旅行。现在回想起来，路途虽然有些漫长，但因为身边是你，好像连等待和奔波都变得有趣了起来。\n当然啦，这次旅行也有不少小小的遗憾。准备得不够充分，很多事情没有安排好，自己也确实笨笨的，没有把一切都照顾周全，还不小心把新买的包包弄脏了。现在想想，还是有点愧疚，跟喜欢的人在一起，或许真的特别容易降智。\n虽然这次旅行并不完美，但我觉得它特别珍贵。因为这是我们一起走过的第一段远方。或许很多年以后，我们已经去过很多地方，见过更多漂亮的风景，但我想，我依然会记得这个国庆节，记得我们第一次一起去云顶，记得那个有些手忙脚乱、却又满是欢喜的自己和你。所以对，解锁了新的----',
      words: ['云', '顶', '那', '天'],
      gift: { name: '包包', desc: '这趟旅行背的那只，还被弄脏了。' }
    },

    rn2: {
      no: '10',
      label: '夏雨',
      date: '2026年6月9日 · 夏 · 雨',
      title: '在一起',
      body: '那天，下班以后，我们一起吃着宵夜，喝着小酒。气氛明明很浪漫，可我的脑袋却像是突然短路了一样，紧张得不知道该说些什么、做些什么。最后，只能笨手笨脚地把准备好的鲜花和蛋糕递到你面前。在车上，问出那句，你愿意和我在一起嘛。嘻嘻，说起来还有点好笑，这句话居然还是你在旁边指引我，告诉我应该怎么说的。明明是我在向你表白，结果反倒像是你一步一步教着我，完成了人生中这么重要的一件事。\n过后，我们手牵着手，一起走在大街上，虽然没有特别的风景，没有特别的经历，但是你在身边依旧特别，心理默默的想着，以后要把什么最好的都给你，那天真的没有准备很充分，本来有非常非常过的小礼物，当时有个小插曲，提前准备包好了，让朋友帮忙寄过来，结果海运120块钱，空运1100，为了节约点钱，选择了海运，结果在海上飘了非常非常多天，最后才收到，本来想给你一个满满当当、惊喜连连的告白，结果最后只有匆匆准备的鲜花和蛋糕。那些精心准备的小礼物，硬生生变成了迟到的惊喜。哎呀哎呀。不管不管，又搞砸了。',
      words: ['在', '一', '起', '了'],
      gift: { name: '戒指', desc: '一枚戒指。' }
    },

    /* ---------- 秋天 ---------- */
    mem3: {
      no: '03',
      label: '秋晴',
      date: '2026年11月6日 · 秋 · 晴',
      title: '鸡腿之日',
      body: '这是我们的第一次宵夜，吃的肯德基，我问你说吃什么，你眼睛一亮，大鸡腿。那是我第一次知道，你喜欢吃肉肉，爱吃肉肉的少女，可可爱爱，古怪精灵。没有什么精心安排，也没有多么浪漫的场景，只是两个人坐在一起，分享着一顿简单的宵夜，却悄悄成为了我们故事里一个值得珍藏的小片段。以后的日子里，我们还会一起吃很多很多顿宵夜，吃更多的大鸡腿，解锁更多好吃的东西。也许有一天，你已经记不清第一次吃肯德基是什么时候了，但会把你这些小小的喜好放在心上。',
      words: ['想', '吃', '大', '鸡', '腿'],
      gift: { name: '叉子勺子', desc: '以后一起吃宵夜用的。' }
    },

    wtr3: {
      no: '07',
      label: '秋阴',
      date: '2026年9月3日 · 秋 · 阴',
      title: '初次日记',
      body: '这是我们第一次决定一起写日记。本想着每天都写，但我觉得与其每日记录流水账，不如把有记忆点，有趣的事情记录下来。看了日期，有许许多多的虎狼之词，嘿嘿，希望我们往后的日子，每当看到里面的美好，都能回到当天的感觉，感受当初脸红心跳的感觉。',
      words: ['写', '下', '心', '跳'],
      gift: { name: '怀表', desc: '日记翻开的时候，时间也回来了。' }
    },

    rn3: {
      no: '11',
      label: '秋雨',
      date: '2025年10月9日 · 秋 · 雨',
      title: '首条信息',
      body: '在一个夜深人静夜黑风高的夜晚，凌晨十一点多，忽然收到一条信息，今晚有月亮吗，我回了一句什么忘记了，大抵是今天下雨，应该没有月亮一类了。你回了一句嗯。这是我们第一次跨国的正式的聊天。有点小高兴，高兴是还能记得我，有点小失落，失落的是回的怎么简短。\n------提示这句话里有其他的小惊喜等待发现，也有可能已经被发现过啦。',
      words: ['首', '条', '信', '息'],
      gift: { name: '丑丑的纸巾盒', desc: '就是丑了点。' }
    },

    /* ---------- 冬天 ---------- */
    mem4: {
      no: '04',
      label: '冬晴',
      date: '2025年12月6日 · 冬 · 晴',
      title: '生日之歌',
      body: '十二点的钟声响起，你的诞辰到啦，缓缓的拿出蛋糕，点亮蜡烛，为你过了第一认识的生日，看着你许愿吹蜡烛。虽然只有简单的生日蛋糕，和简单的生日歌，我不知道你许下了什么愿望，也不知道那个愿望里有没有我，但希望往后的每一年，我都想做那个为你点亮蜡烛、唱生日歌、陪你许愿的人。',
      words: ['生', '日', '快', '乐'],
      gift: { name: '生日蛋糕', desc: '生日那天点蜡烛的那只。' }
    },

    wtr4: {
      no: '08',
      label: '冬阴',
      date: '2025年12月17日 · 冬 · 阴',
      title: '讲故事',
      body: '午夜时分睡得正香，忽然听到一个电话声，气急败坏，但是看见是你，气消了一半，马上拿起手机接听，接起电话，才知道你说自己鬼压床了，醒不过来，心里害怕得不得了。听着你有些紧张的声音，我一边安慰你，一边想着该怎么让你安心下来。其实那时候也没有准备什么特别精彩的故事，可能讲得也不怎么样，甚至有些笨拙，但还是想尽可能地多讲一会儿，让你不再害怕，让你知道，虽然我不能立刻出现在你身边，但至少这一刻，我的声音可以陪着你。为你披荆斩棘，驱散黑雾。',
      words: ['陪', '你', '说', '话'],
      gift: { name: '加湿器灯', desc: '加湿器和灯，夜里一起亮。' }
    },

    rn4: {
      no: '12',
      label: '冬雨',
      date: '2026年1月1日 · 冬 · 雨',
      title: '第一个跨年烟花',
      body: '我们在一个停车场，等待着十二点的到来，夜幕降临，周围渐渐热闹起来，越来越多的人，聚集在那里等待零点的到来。随着第一束烟花冲上天空，砰的一声，绚烂的光芒在夜空中绽放，照亮了整个夜晚，也照亮了你笑盈盈的脸，那是我们的第一个元旦节，虽然新山这座城市，没有我们的落脚点，但是曾经也有朵烟花为你而绽放。愿你绚烂，永不凋零。',
      words: ['跨', '年', '烟', '花'],
      gift: { name: '2027年跨年烟花', desc: '留给 2027 年跨年。' }
    },

    /* ---------- 小鸡毛 ---------- */
    dog1: {
      no: '13',
      label: '小鸡毛',
      date: '金色 · 大只 · 慢',
      title: '鸡毛滚客滚',
      body: '在地上尿了个尿，拉了个屎在你床上',
      words: ['它', '一', '直', '记', '得'],
      gift: { name: '野生狗奶，狗屎糖', desc: '小鸡毛叼来的，别问是什么。' }
    },

    /* ---------- 月亮 ---------- */
    moon: {
      no: '14',
      label: '月亮',
      date: '夜里 · 抬头 · 还有很多次',
      title: '第一次，多到数不清',
      body: '第一次一起去电影院看电影，被冷气冻成狗，却还是觉得那天特别开心；第一次一起去买扭蛋，怀着小小的期待，想看看能不能抽到自己喜欢的那一个；第一次一起去露营，在夜里感受不一样的风景；第一次互相准备礼物，偷偷猜测对方会喜欢什么；第一次认真记录你来姨妈的日子，开始记住那些关于你的小习惯、小细节。\n还有第一次一起爬山，一起挥洒汗水；第一次一起打羽毛球，笨笨地追着球跑；第一次一起唱歌，不管唱得好不好听，都能笑得特别开心；第一次一起正式去吃饭，虽然忘记好不好吃。\n我们有非常非常多的第一次，多到有时候回想起来，才发现原来在不知不觉中，我们已经一起做了这么多事情，一起体验了这么多从前不曾有过的经历。\n其实仔细想想，这些事情单独拿出来，好像都不是什么特别了不起的大事。看一场电影，吃一顿饭，爬一座山，唱几首歌，甚至只是一起逛逛街、散散步，都是再普通不过的日常。但是每次和你在一起经历，都格外的高兴和快乐。\n以后希望能解锁更多更多的第一次，陪你一起做所有想做的事，一起度过所有的困难，一起白头偕老。',
      words: ['第', '一', '次', '都', '是', '你'],
      gift: { name: '3000 马币红包', desc: '月亮替你先收着。' }
    }
  };

  /* ============================================================
     2) 触发点：场景里不再有圆点，全部点真实的东西
     · 主树        → 晴看季节（春/夏/秋/冬），阴走 wtr1~4，雨走 rn1~4
     · 小鸡毛      → 点它，进它自己那一段
     · 夜里点月亮  → 月亮上那份红包
     ============================================================ */
  var MEM_BY_SEASON = { spring: 'mem1', summer: 'mem2', autumn: 'mem3', winter: 'mem4' };
  // 阴 / 雨 各四段，按季节取
  var MEM_BY_WEATHER = {
    cloudy: { spring: 'wtr1', summer: 'wtr2', autumn: 'wtr3', winter: 'wtr4' },
    rain:   { spring: 'rn1',  summer: 'rn2',  autumn: 'rn3',  winter: 'rn4'  }
  };

  // 点树时决定打开哪一段：天气优先，晴（以及没有对应天气条目）走季节
  function memoryFor() {
    var byWeather = MEM_BY_WEATHER[C.currentWeather];
    if (byWeather && byWeather[C.currentSeason]) return byWeather[C.currentSeason];
    return MEM_BY_SEASON[C.currentSeason] || 'mem1';
  }

  var STORE_KEY = 'sakura.gifts.v1';

  /* ============================================================
     3) 运行时
     ============================================================ */
  var C = null, THREE = null;
  var stage = null, sackEl = null, sackNumEl = null, listEl = null, hintEl = null;
  var active = null;
  var prevCam = null, prevTgt = null;
  var saved = {};
  var started = false;
  var canvas = null, raycaster = null, ndc = null;
  var downX = 0, downY = 0, downT = 0;
  var landmarks = [];
  var hintBusy = false, hintNight = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function boot() {
    if (started) return;
    C = window.SakuraCore;
    if (!C || typeof C.isReady !== 'function' || !C.isReady()) {
      setTimeout(boot, 500);
      return;
    }
    started = true;
    THREE = C.THREE;
    loadSaved();
    buildDom();
    buildLandmarks();
    bindPick();
    startProxyTick();
    refreshSack();
    warmTextures();
    console.log('[portal] ready · landmarks=' + landmarks.length + ' · gifts=' + giftCount());
  }

  /* 提前把四季的叶片图、四套纸纹理解码进内存，换季点树时不会因解码延迟“看不见叶子” */
  function warmTextures() {
    try {
      var keys = ['spring', 'summer', 'autumn', 'winter'];
      var urls = [];
      for (var i = 0; i < keys.length; i++) {
        urls.push(leafUrl(keys[i], 0));
        urls.push(leafUrl(keys[i], 1));
        urls.push(leafUrl(keys[i], 2));
        urls.push(veinUrl(keys[i]));
      }
      for (var k = 0; k < urls.length; k++) {
        var im = new Image();
        im.src = urls[k];
        if (im.decode) im.decode().catch(function () {});
      }
    } catch (e) {}
  }

  /* ---------- DOM ---------- */
  function buildDom() {
    stage = el('div');
    stage.id = 'portal-stage';
    document.body.appendChild(stage);

    sackEl = el('div');
    sackEl.id = 'gift-sack';
    sackEl.appendChild(el('span', 'gs-mark'));
    sackEl.appendChild(el('span', null, '礼物'));
    sackNumEl = el('b', null, '0');
    sackEl.appendChild(sackNumEl);
    sackEl.addEventListener('click', toggleGiftList);
    document.body.appendChild(sackEl);

    listEl = el('div');
    listEl.id = 'gift-list';
    document.body.appendChild(listEl);

    hintEl = el('div', 'portal-hint', defaultHint());
    document.body.appendChild(hintEl);
    setTimeout(function () { if (hintEl) hintEl.classList.add('dim'); }, 8000);
  }

  /* ---------- 沙滩上的两个机关 ---------- */
  function makeWoodTexture() {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#8b6742'; g.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 90; i++) {
      var y = Math.random() * 128;
      g.strokeStyle = 'rgba(' + Math.round(70 + Math.random() * 40) + ',' + Math.round(48 + Math.random() * 30) + ',28,' + (0.10 + Math.random() * 0.22) + ')';
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + (Math.random() - 0.5) * 6, 90, y + (Math.random() - 0.5) * 8, 128, y + (Math.random() - 0.5) * 5);
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function makeStoneTexture() {
    var c = document.createElement('canvas'); c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.fillStyle = '#a39a8b'; g.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 300; i++) {
      var x = Math.random() * 128, y = Math.random() * 128, r = 0.6 + Math.random() * 2.4;
      var v = 90 + Math.random() * 90;
      g.fillStyle = 'rgba(' + Math.round(v) + ',' + Math.round(v - 8) + ',' + Math.round(v - 20) + ',' + (0.06 + Math.random() * 0.18) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* 入口不再摆任何新道具：直接点场景里本来就有的东西
     · 主树 / 小鸡毛 → 场景自带的，直接点
     · 月亮 → 按它在屏幕上的真实位置判定（见 skyScreen）
     沙滩谜题、穿越未来两组还只有占位内容，入口先不放出来 */
  function buildLandmarks() {
    // 主树和小鸡毛打上"可点"的标记
    if (C.treeModel) C.treeModel.userData.entry = '__tree';
    var actors = C.dogActors;
    if (actors && actors[0] && actors[0].obj) actors[0].obj.userData.entry = 'dog1';
  }

  /* ---------- 点击：射线打中谁就开谁 ---------- */
  function bindPick() {
    canvas = C.renderer.domElement;
    raycaster = new THREE.Raycaster();
    ndc = new THREE.Vector2();

    canvas.addEventListener('pointerdown', function (e) {
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    });
    canvas.addEventListener('pointerup', function (e) {
      if (active) return;
      var dx = e.clientX - downX, dy = e.clientY - downY;
      if (dx * dx + dy * dy > 30) return;      // 拖动旋转视角，不算点击
      if (Date.now() - downT > 800) return;    // 长按不算
      pick(e.clientX, e.clientY);
    });
  }

  /* ---------- 小狗的点击容错球：狗太小，手机上容易点不准 ---------- */
  var dogProxies = [];
  function startProxyTick() {
    ensureDogProxies();
    for (var i = 0; i < dogProxies.length; i++) {
      var p = dogProxies[i];
      var a = C.dogActors && C.dogActors[i];
      if (!p || !a || !a.obj) continue;
      a.obj.getWorldPosition(p.position);
      p.position.y += 0.36;
    }
    // 昼夜一换，提示条跟着换（夜里不能再写"点太阳"）
    var nn = isNight();
    if (nn !== hintNight) {
      hintNight = nn;
      if (hintEl && !hintBusy) hintEl.textContent = defaultHint();
    }
    requestAnimationFrame(startProxyTick);
  }
  function ensureDogProxies() {
    var actors = C.dogActors;
    if (!actors) return;
    for (var i = 0; i < 2; i++) {
      if (dogProxies[i]) continue;
      var a = actors[i];
      if (!a || !a.obj) continue;
      var r = i === 0 ? 0.78 : 0.58;   // 狗会边走边嬉戏，容错球放大才好点中
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
      );
      m.userData.entry = 'dog' + (i + 1);
      C.scene.add(m);
      dogProxies[i] = m;
    }
  }

  function pick(cx, cy) {
    if (!raycaster || !C.camera || !canvas) return;
    var r = canvas.getBoundingClientRect();
    // 狗一直在走，而且个头小，射线经常擦着它过去。
    // 所以先把狗投影到屏幕、按二维距离判定，并且排在射线之前。
    var dogAct = C.dogActors;
    if (dogAct && dogAct.length) {
      var wv = new THREE.Vector3();
      for (var di = 0; di < dogAct.length; di++) {
        var da = dogAct[di];
        if (!da || !da.obj) continue;
        da.obj.getWorldPosition(wv);
        wv.y += 0.75;                              // 取狗身中部，不是脚底
        // project() 会就地改写 wv，所以先把世界坐标存下来给 openEntry 用
        var wx = wv.x, wy = wv.y, wz = wv.z;
        wv.project(C.camera);
        if (wv.z > 1) continue;                    // 在相机背后
        var sx = (wv.x * 0.5 + 0.5) * r.width + r.left;
        var sy = (-wv.y * 0.5 + 0.5) * r.height + r.top;
        if (Math.hypot(cx - sx, cy - sy) < Math.min(r.width, r.height) * 0.065) {
          openEntry('dog' + (di + 1), [wx, wy, wz], 'dog');
          return;
        }
      }
    }
    ndc.x = ((cx - r.left) / r.width) * 2 - 1;
    ndc.y = -((cy - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, C.camera);

    var targets = [];
    if (C.treeModel) targets.push(C.treeModel);
    var actors = C.dogActors;
    if (actors) {
      for (var i = 0; i < actors.length; i++) {
        if (!actors[i] || !actors[i].obj) continue;
        // 狗是异步加载的，可能晚于 portal 启动，所以每次点击前补一次标记
        if (!actors[i].obj.userData.entry) actors[i].obj.userData.entry = 'dog' + (i + 1);
        targets.push(actors[i].obj);
      }
    }
    for (var j = 0; j < landmarks.length; j++) targets.push(landmarks[j].obj);
    for (var k = 0; k < dogProxies.length; k++) if (dogProxies[k]) targets.push(dogProxies[k]);

    var hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) {
      var rr2 = canvas.getBoundingClientRect();

      // 点月亮：按它在屏幕上的真实位置判定，比隐形球稳得多
      var sky = skyScreen(cx, cy, rr2);
      if (sky) {
        // 已经收下过也照样让他再打开看一遍：故事可以重读，礼物不会重复发
        openEntry('moon', [0, 14, 0], 'sky');
      }
      return;
    }

    // 太阳/月亮本身不可被射线打到（Sprite），但如果真打中了容错球也照样进
    function skyScreen(cx2, cy2, rc) {
      if (!isNight()) return false;              // 白天点太阳不触发，只有夜里点月亮才进"穿越未来"
      var m = C.moonMesh;
      if (!m || !m.visible) return false;
      var v = new THREE.Vector3().copy(m.position).project(C.camera);
      if (v.z > 1) return false;                 // 在相机背后
      var sx = (v.x * 0.5 + 0.5) * rc.width + rc.left;
      var sy = (-v.y * 0.5 + 0.5) * rc.height + rc.top;
      var dx = cx2 - sx, dy = cy2 - sy;
      var rad = rc.height * 0.13;                // 月亮圆盘 + 一点余量
      return dx * dx + dy * dy < rad * rad;
    }

    var obj = hits[0].object, entry = null;
    while (obj) {
      if (obj.userData && obj.userData.entry) { entry = obj.userData.entry; break; }
      obj = obj.parent;
    }
    if (!entry) return;

    var p = hits[0].point;

    if (entry === '__tree') {
      var wid = memoryFor();
      openEntry(wid, [p.x, p.y, p.z], 'tree');
      return;
    }
    // 狗：对准狗身中段，而不是射线打到的球面点
    var idx = entry === 'dog1' ? 0 : (entry === 'dog2' ? 1 : -1);
    if (idx >= 0) {
      var a2 = C.dogActors && C.dogActors[idx];
      if (a2 && a2.obj) {
        var wp = new THREE.Vector3();
        a2.obj.getWorldPosition(wp);
        openEntry(entry, [wp.x, wp.y + 0.45, wp.z], 'dog');
        return;
      }
    }
    openEntry(entry, [p.x, p.y, p.z], 'dog');
  }

  function isNight() {
    return !(C.sunMesh && C.sunMesh.visible);
  }
  function defaultHint() {
    return isNight()
      ? '点树 · 点小鸡毛 · 点天上的月亮'
      : '点树 · 点小鸡毛';
  }

  function flashHint(text) {
    if (!hintEl) return;
    hintBusy = true;
    hintEl.textContent = text;
    hintEl.classList.remove('dim');
    clearTimeout(flashHint._t);
    flashHint._t = setTimeout(function () {
      hintBusy = false;
      hintEl.textContent = defaultHint();
      hintEl.classList.add('dim');
    }, 2600);
  }

  /* ============================================================
     3.5) 点树：相机不动，树叶从树冠向屏幕中心汇聚成一张叶子纸
     ============================================================ */
  /* 四季的飘落物：形状、配色、纸卡配色都集中在这里改 */
  var SEASON_SPEC = {
    spring: {
      shape: 'petal',
      cols: [['#ffe6ee', '#fbc3d1', '#ef9db3'], ['#fff2f5', '#f8d5df', '#e8aabb'], ['#fdeef2', '#f4c0d0', '#da97a8']],
      edge: 'rgba(212,132,157,.30)',
      paper: 'linear-gradient(158deg,#fdf7f8 0%,#f9e9ec 52%,#f1dde0 100%)',
      veinMain: 'rgba(196,132,152,.19)',
      veinSide: 'rgba(196,132,152,.14)',
      fiber: [238, 190, 200]
    },
    summer: {
      shape: 'leaf',
      cols: [['#d3e7ae', '#a8c976', '#7ba051'], ['#cfe4a2', '#95bf66', '#6d9447'], ['#e0edc0', '#b6d18a', '#8aae5f']],
      edge: 'rgba(96,124,66,.32)',
      paper: 'linear-gradient(158deg,#f9f8ec 0%,#f1f3e1 52%,#e8edd6 100%)',
      veinMain: 'rgba(120,136,92,.20)',
      veinSide: 'rgba(120,136,92,.15)',
      fiber: [236, 238, 220]
    },
    autumn: {
      shape: 'leaf',
      cols: [['#f7d29a', '#e39c56', '#b66533'], ['#f4bd83', '#d8804a', '#9c4f2c'], ['#f8dcae', '#e7ab63', '#bd7743']],
      edge: 'rgba(150,88,44,.32)',
      paper: 'linear-gradient(158deg,#fdf5e6 0%,#faeada 52%,#f2ddc4 100%)',
      veinMain: 'rgba(176,124,76,.20)',
      veinSide: 'rgba(176,124,76,.15)',
      fiber: [244, 228, 206]
    },
    winter: {
      shape: 'dry',
      cols: [['#dcd0bf', '#bdab96', '#9a8571'], ['#e2d9cb', '#c3b6a4', '#a2917c'], ['#d6c9b8', '#b6a491', '#8e7b69']],
      edge: 'rgba(110,96,80,.34)',
      paper: 'linear-gradient(158deg,#f9f9f6 0%,#edf0f2 52%,#e0e5e9 100%)',
      veinMain: 'rgba(120,132,140,.20)',
      veinSide: 'rgba(120,132,140,.15)',
      fiber: [232, 236, 240]
    }
  };

  function seasonKey() {
    var s = (C && C.currentSeason) || 'spring';
    return SEASON_SPEC[s] ? s : 'spring';
  }
  function seasonSpec() { return SEASON_SPEC[seasonKey()]; }

  var leafCache = {};

  /* 画一片飘落物：春=带缺刻樱花瓣；夏/秋=细长叶；冬=干枯破叶 */
  function makeLeafCanvas(shape, col, edge) {
    var c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    var g = c.getContext('2d');
    var cx = 48, top = 5, bot = 91;
    var grd = g.createLinearGradient(cx - 26, 12, cx + 24, 86);
    grd.addColorStop(0, col[0]);
    grd.addColorStop(0.52, col[1]);
    grd.addColorStop(1, col[2]);
    g.fillStyle = grd;
    g.strokeStyle = edge || 'rgba(0,0,0,.2)';
    g.lineWidth = 1.15;

    if (shape === 'petal') {
      // 樱花花瓣：短阔，顶端一个 V 形缺口
      var hw = 23;
      g.beginPath();
      g.moveTo(cx, bot);
      g.bezierCurveTo(cx + hw, bot - 22, cx + hw * 0.94, top + 30, cx + 5.4, top + 12);
      g.lineTo(cx, top + 21);
      g.lineTo(cx - 5.4, top + 12);
      g.bezierCurveTo(cx - hw * 0.94, top + 30, cx - hw, bot - 22, cx, bot);
      g.closePath();
      g.fill();
      g.stroke();
      var rg = g.createRadialGradient(cx, bot - 8, 1, cx, bot - 8, 24);
      rg.addColorStop(0, 'rgba(255,255,255,.62)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, bot - 8, 22, 0, Math.PI * 2); g.fill();
    } else if (shape === 'leaf') {
      var lw = 15;
      g.beginPath();
      g.moveTo(cx, top);
      g.bezierCurveTo(cx + lw, 26, cx + lw * 0.84, 64, cx, bot);
      g.bezierCurveTo(cx - lw * 0.84, 64, cx - lw, 26, cx, top);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.42)';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, top + 5); g.lineTo(cx, bot - 4); g.stroke();
      g.strokeStyle = 'rgba(90,70,40,.22)';
      g.lineWidth = 0.85;
      for (var i = 1; i <= 5; i++) {
        var y = top + 10 + (bot - top - 16) * (i / 6);
        g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + lw * 0.62, y - 8); g.stroke();
        g.beginPath(); g.moveTo(cx, y); g.lineTo(cx - lw * 0.62, y - 8); g.stroke();
      }
    } else {
      // 枯叶：边缘不规则、带缺口
      var R = 30, pts = [], n = 16;
      for (var k = 0; k <= n; k++) {
        var a = (k / n) * Math.PI * 2 - Math.PI / 2;
        var rr = R * (0.72 + Math.random() * 0.30);
        if (k % 5 === 0) rr *= 0.64;
        pts.push([cx + Math.cos(a) * rr, 48 + Math.sin(a) * rr * 0.98]);
      }
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var q = 1; q < pts.length; q++) g.lineTo(pts[q][0], pts[q][1]);
      g.closePath();
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(90,78,64,.36)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx, 26); g.lineTo(cx, 70); g.stroke();
    }
    return c.toDataURL('image/png');
  }

  function leafUrl(sk, vi) {
    sk = sk || seasonKey();
    vi = vi || 0;
    var key = sk + '#' + vi;
    if (leafCache[key]) return leafCache[key];
    var sp = SEASON_SPEC[sk] || SEASON_SPEC.spring;
    leafCache[key] = makeLeafCanvas(sp.shape, sp.cols[vi % sp.cols.length], sp.edge);
    return leafCache[key];
  }
  // 叶子纸的纹理：季节纸底 + 纸纤维 + 一片大叶子的叶脉
  var veinCache = {};
  function veinUrl(sk) {
    sk = sk || seasonKey();
    if (veinCache[sk]) return veinCache[sk];
    var sp = SEASON_SPEC[sk] || SEASON_SPEC.spring;
    var fb = sp.fiber || [240, 240, 230];
    var S = 512;
    var c = document.createElement('canvas');
    c.width = S; c.height = S;
    var g = c.getContext('2d');
    g.fillStyle = 'rgb(' + fb[0] + ',' + fb[1] + ',' + fb[2] + ')';
    g.fillRect(0, 0, S, S);
    for (var i = 0; i < 2400; i++) {
      var v = 205 + Math.random() * 40;
      g.fillStyle = 'rgba(' + Math.round(fb[0] * 0.96 + v * 0.04) + ',' + Math.round(fb[1] * 0.96 + v * 0.04) + ',' + Math.round(fb[2] * 0.96 + v * 0.04) + ',' + (0.04 + Math.random() * 0.10) + ')';
      g.beginPath();
      g.arc(Math.random() * S, Math.random() * S, 0.5 + Math.random() * 1.3, 0, Math.PI * 2);
      g.fill();
    }
    var ox = S * 0.94, oy = S * 0.04, mx = S * 0.58, my = S * 0.52, tx = S * 0.06, ty = S * 0.98;
    g.strokeStyle = sp.veinMain;
    g.lineWidth = 3.2;
    g.beginPath();
    g.moveTo(ox, oy);
    g.quadraticCurveTo(mx, my, tx, ty);
    g.stroke();
    g.strokeStyle = sp.veinSide;
    g.lineWidth = 1.6;
    for (var k = 1; k < 9; k++) {
      var t = k / 9;
      var u = 1 - t;
      var bx = u * u * ox + 2 * u * t * mx + t * t * tx;
      var by = u * u * oy + 2 * u * t * my + t * t * ty;
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx - S * 0.10, by + S * 0.13, bx - S * 0.23, by + S * 0.11);
      g.stroke();
      g.beginPath();
      g.moveTo(bx, by);
      g.quadraticCurveTo(bx + S * 0.09, by - S * 0.11, bx + S * 0.19, by - S * 0.17);
      g.stroke();
    }
    veinCache[sk] = c.toDataURL('image/png');
    return veinCache[sk];
  }

  function projectScreen(x, y, z) {
    var r = canvas.getBoundingClientRect();
    var v = new THREE.Vector3(x, y, z).project(C.camera);
    return {
      x: (v.x * 0.5 + 0.5) * r.width + r.left,
      y: (-v.y * 0.5 + 0.5) * r.height + r.top
    };
  }

  function qbez(a, b, c2, t) {
    var u = 1 - t;
    return u * u * a + 2 * u * t * b + t * t * c2;
  }

  // 树叶汇聚：从树冠那片位置飞向屏幕正中，边飞边转，最后叠成一片，交给纸卡
  // 点树：四季各自的飘落物从树冠、天上、地面三处飘起，最后汇聚成一张季节纸
  function playLeafGather(originX, originY, done) {
    var W = window.innerWidth, H = window.innerHeight;
    var cx = W * 0.5, cy = H * 0.5;
    var layer = document.createElement('div');
    layer.id = 'leaf-gather';
    document.body.appendChild(layer);

    var sk = seasonKey();
    var srcList = [leafUrl(sk, 0), leafUrl(sk, 1), leafUrl(sk, 2)];
    // 形态决定下落方式（参考落叶空气动力学：圆润瓣左右飘摆、细长叶沿长轴自旋螺旋、干叶大幅翻滚）
    var motion = seasonSpec().shape === 'petal' ? 'flutter'
               : (seasonSpec().shape === 'dry' ? 'tumble' : 'spiral');
    var N = W < 700 ? 26 : 46;
    var items = [];

    for (var i = 0; i < N; i++) {
      var img = document.createElement('img');
      img.className = 'gather-leaf';
      img.alt = '';
      var size = (sk === 'spring' ? 17 : 20) + Math.random() * 28;
      var from, sx, sy, bx, by, delay;
      var r = Math.random();
      if (r < 0.40) {
        // 树冠：围着点中的那片树冠散开，带上下落差
        from = 'tree';
        var ang = Math.random() * Math.PI * 2;
        var rad = Math.random() * Math.min(W, H) * 0.26;
        sx = originX + Math.cos(ang) * rad * 1.28;
        sy = originY + Math.sin(ang) * rad * 0.96 - 12;
        bx = sx + (Math.random() - 0.5) * 200;
        by = sy + 80 + Math.random() * 160;
        delay = Math.random() * 0.20;
      } else if (r < 0.62) {
        // 画面上方：像从更高处的枝头垂落下来
        from = 'sky';
        sx = Math.random() * W;
        sy = -24 - Math.random() * H * 0.16;
        bx = sx + (Math.random() - 0.5) * 170;
        by = sy + H * 0.36 + Math.random() * 90;
        delay = Math.random() * 0.22;
      } else {
        // 地面：从屏幕下沿被风卷起来
        from = 'ground';
        sx = Math.random() * W;
        sy = H + 18 + Math.random() * 96;
        bx = sx + (Math.random() - 0.5) * 160;
        by = sy - H * 0.34 - Math.random() * 80;
        delay = 0.10 + Math.random() * 0.24;
      }
      var ex = cx + (Math.random() - 0.5) * 42;
      var ey = cy + (Math.random() - 0.5) * 30;
      // 三路起点用同一季节的三档色：树上鲜、空中淡、地面偏枯，一眼能看出是从哪儿起飘的
      img.src = srcList[from === 'tree' ? 0 : (from === 'sky' ? 1 : 2)];
      img.style.width = size + 'px';
      img.style.height = size + 'px';
      layer.appendChild(img);
      items.push({
        img: img, from: from, sx: sx, sy: sy, ex: ex, ey: ey, size: size,
        mode: motion,
        bx: bx, by: by,
        rot0: Math.random() * 360,
        rot1: (Math.random() - 0.5) * 12,
        spin: (Math.random() - 0.5) * 560,
        flip0: Math.random() * Math.PI * 2,
        flipSpd: (0.5 + Math.random() * 1.15) * 6,
        sway: 10 + Math.random() * 26,
        ph: Math.random() * Math.PI * 2,
        delay: delay,
        dur: 0.88 + Math.random() * 0.42
      });
    }

    var TOT = 1.72;
    var t0 = performance.now();
    function frame(now) {
      var t = (now - t0) / 1000;
      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        var p = (t - it.delay) / it.dur;
        var pRaw = p;
        p = p < 0 ? 0 : (p > 1 ? 1 : p);
        // 前 62% 是自由飘落（慢、轻），后 38% 收拢到中心
        var e;
        if (p < 0.62) {
          e = 0.62 * (1 - Math.pow(1 - p / 0.62, 2.2));
        } else {
          e = 0.62 + 0.38 * Math.pow((p - 0.62) / 0.38, 0.62);
        }
        if (e < 0) e = 0; if (e > 1) e = 1;
        var bx = qbez(it.sx, it.bx, it.ex, e);
        var by = qbez(it.sy, it.by, it.ey, e);
        // 左右摆 + 上下浮，越靠近中心越弱
        bx += Math.sin(p * Math.PI * 3.4 + it.ph) * it.sway * (1 - e);
        by += Math.cos(p * Math.PI * 2.2 + it.ph) * it.sway * 0.35 * (1 - e);
        var sc = 1 - 0.26 * e;
        var rot, fy;
        if (it.mode === 'flutter') {
          // 圆润的瓣：绕着自身左右飘摆，不整圈翻滚
          rot = it.rot0 + Math.sin(p * Math.PI * 2.6 + it.ph) * 15 + it.rot1 * e;
          fy = 1;
        } else if (it.mode === 'spiral') {
          // 细长的叶：沿长轴持续自旋，边旋边偏，像竹蜻蜓
          rot = it.rot0 + it.spin * p * 1.45 + it.rot1 * e;
          var sf = 0.55 + 0.45 * Math.abs(Math.cos(it.flip0 * 0.5));
          fy = sf;
        } else {
          // 干叶：大幅翻滚，翻过 0 时收成一条线
          rot = it.rot0 + it.spin * p * 0.55 + it.rot1 * e;
          fy = Math.cos(it.flip0 + it.flipSpd * p);
          if (Math.abs(fy) < 0.07) fy = fy < 0 ? -0.07 : 0.07;
        }
        // 从地面起的那批：一开始几乎是平躺的（贴地），被风掀起来才立起
        if (it.from === 'ground') {
          var rise = Math.min(1, 0.16 + p * 2.4);
          fy *= rise;
        }
        var fade;
        if (pRaw <= 0) fade = 0;
        else if (it.from === 'ground' && p < 0.12) fade = p / 0.12 * 0.95;
        else if (t > 1.30) fade = Math.max(0, 1 - (t - 1.30) / 0.30);
        else fade = 1;
        it.img.style.transform =
          'translate3d(' + (bx - it.size / 2).toFixed(1) + 'px,' + (by - it.size / 2).toFixed(1) + 'px,0)' +
          ' rotate(' + rot.toFixed(1) + 'deg)' +
          ' scale(' + sc.toFixed(3) + ',' + (sc * fy).toFixed(3) + ')';
        it.img.style.opacity = fade.toFixed(2);
      }
      if (t < TOT) {
        requestAnimationFrame(frame);
      } else if (layer.parentNode) {
        layer.parentNode.removeChild(layer);
      }
    }
    requestAnimationFrame(frame);
    setTimeout(done, 1180);
  }

  /* ============================================================
     4) 打开一个入口
     ============================================================ */
  /* 看狗 / 看机关时相机是俯视低角度，会撞 OrbitControls 的极角上限被强行改位置，先放宽再恢复 */
  var savedMaxPolar = null, savedMinD = null;
  function relaxControls() {
    var c = C.controls;
    if (!c) return;
    savedMaxPolar = c.maxPolarAngle;
    savedMinD = c.minDistance;
    c.maxPolarAngle = Math.PI * 0.88;
    c.minDistance = 1.0;
  }
  function restoreControls() {
    var c = C.controls;
    if (!c) return;
    if (savedMaxPolar != null) c.maxPolarAngle = savedMaxPolar;
    if (savedMinD != null) c.minDistance = savedMinD;
    savedMaxPolar = null;
    savedMinD = null;
  }

  function openEntry(id, world, kind) {
    if (active) return;
    var c = CONTENT[id];
    if (!c) return;

    var rec = { id: id, kind: kind, el: null };
    active = rec;
    prevCam = C.camera.position.clone();
    prevTgt = C.controls.target.clone();

    document.body.classList.add('portal-open');
    C.setControlsEnabled(false);
    if (kind !== 'tree') relaxControls();   // 点树不出卡片镜头，不用放宽极角限制

    var px = world[0], py = world[1], pz = world[2];

    // 点树：镜头不靠过去，树叶从树冠位置向屏幕正中汇聚，聚成一张叶子纸
    if (kind === 'tree') {
      var scr = projectScreen(px, py + 2.0, pz);
      playLeafGather(scr.x, scr.y, function () { showStory(rec); });
      return;
    }

    var dist = kind === 'dog' ? 4.8 : (kind === 'landmark' ? 3.4 : 3.2);
    var lift = kind === 'dog' ? 0.72 : 0.5;
    if (kind === 'sky') { dist = 17; lift = 1.4; }   // 点太阳进未来时，退远一点，别贴在树冠上
    var lookY = kind === 'dog' ? py + 0.18 : py;

    // 相机：从树心方向退出来一点，略高，越过目标看
    var vx = px, vz = pz;
    var len = Math.sqrt(vx * vx + vz * vz);
    if (len < 0.001) { vx = 0; vz = 1; len = 1; }
    var camX = px + (vx / len) * dist;
    var camZ = pz + (vz / len) * dist;
    var camY = py + lift;

    try {
      C.flyToPoint([camX, camY, camZ], [px, lookY, pz], 1.0);
    } catch (e) {
      console.error('[portal] fly failed:', e && e.message ? e.message : e);
    }

    setTimeout(function () { showStory(rec); }, 460);
  }

  /* ---------- 第 1 步：内容 ---------- */
  function showStory(rec) {
    var c = CONTENT[rec.id];
    stage.innerHTML = '';

    var wrap = el('div', 'stage-wrap');
    var close = el('button', 'stage-close', '×');
    close.type = 'button';
    close.addEventListener('click', closeStage);
    wrap.appendChild(close);

    var paper = el('div', 'paper');
    // 叶子纸：纸底与叶脉跟着当前季节走
    var sp = seasonSpec();
    paper.style.background = sp.paper;
    var vein = el('div', 'paper-vein');
    vein.style.backgroundImage = 'url(' + veinUrl(seasonKey()) + ')';
    paper.appendChild(vein);
    var head = el('div', 'paper-head');
    head.appendChild(el('span', 'paper-no', c.no));
    head.appendChild(el('span', 'paper-date', c.date));
    paper.appendChild(head);

    paper.appendChild(el('h2', null, c.title));

    var lines = String(c.body || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      paper.appendChild(el('p', null, lines[i]));
    }
    paper.appendChild(el('div', 'paper-note', '读完，往下走一步。'));

    var btn = el('button', 'paper-btn');
    btn.type = 'button';
    btn.appendChild(document.createTextNode('下一步'));
    btn.appendChild(el('span', 'ar', '→'));
    btn.addEventListener('click', function () { showGift(rec); });
    paper.appendChild(btn);

    wrap.appendChild(paper);
    stage.appendChild(wrap);
    stage.classList.add('show');
  }

  /* ---------- 第 2 步：礼物（读完故事点下一步，直接开礼物盒） ---------- */
  function showGift(rec) {
    var c = CONTENT[rec.id];
    stage.innerHTML = '';

    var wrap = el('div', 'stage-wrap');
    var close = el('button', 'stage-close', '×');
    close.type = 'button';
    close.addEventListener('click', closeStage);
    wrap.appendChild(close);

    var holder = el('div', 'gift-stage');

    var box = el('div', 'giftbox');
    box.setAttribute('role', 'button');
    box.setAttribute('tabindex', '0');
    box.appendChild(el('div', 'gb-halo'));
    box.appendChild(el('div', 'gb-shadow'));

    var body = el('div', 'gb-body');
    body.appendChild(el('span', 'gb-ribbon-v'));
    body.appendChild(el('span', 'gb-ribbon-h'));
    body.appendChild(el('span', 'gb-seal'));
    var tag = el('span', 'gb-tag');
    tag.textContent = '给你';
    body.appendChild(tag);
    box.appendChild(body);

    var lid = el('div', 'gb-lid');
    lid.appendChild(el('span', 'gb-ribbon-v'));
    var bow = el('span', 'gb-bow');
    bow.appendChild(el('span', 'loop loop-l'));
    bow.appendChild(el('span', 'loop loop-r'));
    bow.appendChild(el('span', 'tail tail-l'));
    bow.appendChild(el('span', 'tail tail-r'));
    bow.appendChild(el('span', 'knot'));
    lid.appendChild(bow);
    box.appendChild(lid);

    // 盒口：开盒时从这里涌出花瓣
    var petals = el('div', 'gb-petals');
    box.appendChild(petals);

    // 盒子周围绕飞的几片小花瓣
    for (var fi = 0; fi < 3; fi++) {
      var fl = el('span', 'gb-flutter');
      fl.style.left = (fi * 36 + 4) + 'px';
      fl.style.top = (fi * 20 - 6) + 'px';
      fl.style.setProperty('--fx', (fi % 2 ? 16 : -13) + 'px');
      fl.style.setProperty('--fy', (-15 - fi * 7) + 'px');
      fl.style.animationDelay = (fi * 2.2).toFixed(1) + 's';
      box.appendChild(fl);
    }

    holder.appendChild(box);

    var hint = el('div', 'gift-hint', '点一下');
    holder.appendChild(hint);

    wrap.appendChild(holder);
    stage.appendChild(wrap);

    function open() {
      if (box.classList.contains('open')) return;
      box.classList.add('open');
      hint.style.display = 'none';

      // 盒口涌出的樱花瓣：方向扇形散开，各自旋落
      var PN = 15;
      for (var pi = 0; pi < PN; pi++) {
        var pe = el('span', 'gb-petal');
        var ang = (pi / PN) * Math.PI * 2 + Math.random() * 0.55;
        var dist = 66 + Math.random() * 96;
        pe.style.setProperty('--tx', (Math.cos(ang) * dist).toFixed(0) + 'px');
        pe.style.setProperty('--ty', (-38 - Math.random() * 112).toFixed(0) + 'px');
        pe.style.setProperty('--rz', (Math.random() * 720 - 360).toFixed(0) + 'deg');
        pe.style.animationDelay = (Math.random() * 0.22).toFixed(2) + 's';
        petals.appendChild(pe);
      }

      setTimeout(function () {
        var card = el('div', 'gift-card');
        card.appendChild(el('div', 'gift-mark'));
        card.appendChild(el('h3', null, c.gift.name));
        var ps = String(c.gift.desc || '').split('\n');
        for (var i = 0; i < ps.length; i++) {
          if (!ps[i]) continue;
          card.appendChild(el('p', null, ps[i]));
        }
        var take = el('button', 'gift-take', '收下');
        take.type = 'button';
        take.addEventListener('click', function () {
          takeGift(rec, card);
        });
        card.appendChild(take);

        holdInsertAfter(card, holder);
        // 卡片升起后礼盒退场，避免盒子和卡片上下堆着两个主角
        setTimeout(function () { box.classList.add('out'); }, 260);
      }, 700);
    }

    box.addEventListener('click', open);
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }

  function holdInsertAfter(node, ref) {
    if (ref.nextSibling) ref.parentNode.insertBefore(node, ref.nextSibling);
    else ref.parentNode.appendChild(node);
  }

  /* ============================================================
     5) 收下礼物
     ============================================================ */
  function takeGift(rec, card) {
    saved[rec.id] = true;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (e) {}
    rec.el && rec.el.classList.add('done');
    refreshSack();

    card.style.transition = 'opacity .35s, transform .35s';
    card.style.opacity = '0';
    card.style.transform = 'rotate(.4deg) translateY(-10px)';

    setTimeout(closeStage, 900);
  }

  function closeStage() {
    if (!active && !stage.classList.contains('show')) return;

    var wasTree = !!(active && active.kind === 'tree');

    stage.classList.remove('show');
    stage.innerHTML = '';
    document.body.classList.remove('portal-open');

    if (prevCam && !wasTree) {
      C.flyToPoint(
        [prevCam.x, prevCam.y, prevCam.z],
        [prevTgt.x, prevTgt.y, prevTgt.z],
        1.0
      );
    }
    C.setControlsEnabled(true);
    setTimeout(restoreControls, 1300);

    active = null;
    prevCam = null;
    prevTgt = null;
  }

  /* ============================================================
     6) 礼物袋
     ============================================================ */
  function giftCount() {
    var n = 0;
    for (var k in saved) { if (saved[k] && CONTENT[k]) n++; }
    return n;
  }

  function refreshSack() {
    if (!sackNumEl) return;
    sackNumEl.textContent = String(giftCount());
    if (listEl) buildList();
  }

  function buildList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    var any = false;
    for (var id in CONTENT) {
      if (!saved[id]) continue;
      any = true;
      var row = el('div', 'gl-row');
      row.appendChild(document.createTextNode(CONTENT[id].label + ' · ' + CONTENT[id].gift.name));
      listEl.appendChild(row);
    }
    if (!any) listEl.appendChild(el('div', 'gl-empty', '还没有礼物。去点树、点小鸡毛（夜里再点天上的月亮）。'));
  }

  function toggleGiftList(e) {
    e.stopPropagation();
    if (!listEl) return;
    var willShow = !listEl.classList.contains('show');
    listEl.classList.toggle('show', willShow);
    if (willShow) buildList();
  }

  document.addEventListener('click', function (e) {
    if (listEl && listEl.classList.contains('show') && !listEl.contains(e.target) && e.target !== sackEl) {
      listEl.classList.remove('show');
    }
  });

  /* ============================================================
     8) 存档
     ============================================================ */
  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      saved = raw ? (JSON.parse(raw) || {}) : {};
    } catch (e) { saved = {}; }
  }

  /* ---------- 启动 ---------- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
