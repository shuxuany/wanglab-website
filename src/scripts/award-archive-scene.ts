// 学生获奖三维档案阵列（three.js）
// - 象牙色档案卡立在地面上：同一等级的奖状排成一横排（沿 x 方向，卡面朝 +x），不同等级前后排列（沿 z 方向）
// - 鼠标所在位置的档案卡隆起成平缓的波浪；选中的奖状继续抬起、转向镜头成为波峰，并从周围发出一圈涟漪
// - 未选中的证书隔着磨砂；选中后自上而下变清晰（类似档案解密）
// - 空闲时卡片缓慢呼吸起伏，长时间无人操作时轮播「高等级奖状」
// 卡片、灯光、动效均为本站自行实现，参数参考了 LBEILC/RhineLabUI（MIT）的设计说明：斜俯视远焦镜头、选中波浪与呼吸周期
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

type Item = {
  no: string;
  row: number;
  col: number;
  level: string;
  title: string;
  note: string;
  issuer: string;
  date: string;
  kind: string;
  image: string;
  tex: string;
  featured: boolean;
};
type Row = { id: string; name: string; en: string; count: number };
type Payload = {
  lang: 'zh' | 'en';
  start: number;
  rows: Row[];
  items: Item[];
  text: { hintTouch: string };
};

// ---------- 尺寸（世界单位）
const W = 3.0; // 卡片宽（z 方向）
const H = 2.12; // 卡片高
const T = 0.15; // 卡片厚（x 方向）
const S = 0.36; // 同一横排相邻卡片的间距
const LZ = 3.6; // 横排间距
const STEP = 3; // 相邻两张奖状之间隔开的格数
const EXTRA = 2; // 前后各补几排空白档案
const LIFT = 2.9; // 选中奖状的抬起高度
const SEL_SCALE = 1.95; // 选中奖状抬起后放大的倍数（以底边为基准）

// ---------- 镜头：斜俯视、远距离小视场角（压缩透视）
const AZIMUTH = THREE.MathUtils.degToRad(34);
const ELEVATION = THREE.MathUtils.degToRad(27);
const FACE_YAW = -(Math.PI / 2 - AZIMUTH) * 0.92; // 抬起后转向镜头
const FACE_TILT = ELEVATION * 0.55;

// ---------- 配色（暖灰白底、象牙色档案、琥珀色选中信号）
const BG = 0xebe6e0;
const C_FILL = new THREE.Color(0xe5dfd4);
const C_CERT = new THREE.Color(0xf6f2eb);
const C_MARK = new THREE.Color(0x48443d);
const C_MARK_CERT = new THREE.Color(0xb98a52);
const C_MARK_SEL = new THREE.Color(0xf0a94e);

const FONT_D = '"Space Grotesk Variable", "Inter Variable", "Segoe UI", Arial, sans-serif';
const FONT_T = '"Inter Variable", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const pad2 = (k: number) => String(k).padStart(2, '0');

// 卡片底部在阵列缝隙里更暗：按世界坐标高度近似环境遮蔽
const AO_VERT = `#include <project_vertex>
  vec4 rlW = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    rlW = instanceMatrix * rlW;
  #endif
  vRlY = ( modelMatrix * rlW ).y;`;
const AO_FRAG = `#include <color_fragment>
  diffuseColor.rgb *= mix( 0.58, 1.0, smoothstep( -0.05, 2.3, vRlY ) );`;

function patchAo(sh: { vertexShader: string; fragmentShader: string }) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRlY;').replace('#include <project_vertex>', AO_VERT);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRlY;').replace('#include <color_fragment>', AO_FRAG);
}

// 证书面：未选中时是磨砂（低清晰度的模糊采样 + 乳白），选中后清晰区域自上而下展开，交界处有一条扫描线
const FACE_FRAG = `#ifdef USE_MAP
  vec4 rlSharp = texture2D( map, vMapUv );
  vec4 rlBlur = texture2D( map, vMapUv, 4.5 );
  float rlTop = 1.0 - vMapUv.y;
  float rlClear = 1.0 - smoothstep( uReveal - 0.04, uReveal + 0.04, rlTop );
  vec3 rlFrost = mix( rlBlur.rgb, vec3( 0.94, 0.925, 0.9 ), 0.42 );
  vec3 rlCol = mix( rlFrost, rlSharp.rgb, rlClear );
  float rlScan = ( 1.0 - smoothstep( 0.0, 0.01, abs( rlTop - uReveal ) ) ) * step( 0.002, uReveal ) * step( uReveal, 0.995 );
  rlCol = mix( rlCol, vec3( 0.11, 0.1, 0.09 ), rlScan * 0.8 );
  diffuseColor *= vec4( rlCol, 1.0 );
#endif`;

function faceMaterial(tex: THREE.Texture) {
  const uniforms = { uReveal: { value: 0 } };
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.68, metalness: 0, envMapIntensity: 0.7 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uReveal = uniforms.uReveal;
    patchAo(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uReveal;')
      .replace('#include <map_fragment>', FACE_FRAG);
  };
  mat.customProgramCacheKey = () => 'rl-face';
  return { mat, uniforms };
}

// ---------- 证书贴图（画布）：有照片的放照片，没有照片的画成文字档案卡
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  // 中文逐字断行，英文按单词断行
  const tokens = text.match(/[⺀-鿿＀-￯　-〿]|[^\s⺀-鿿＀-￯　-〿]+|\s+/g) ?? [];
  const lines: string[] = [];
  let line = '';
  for (const tk of tokens) {
    const next = line + tk;
    if (ctx.measureText(next.trimEnd()).width > maxW && line.trim()) {
      lines.push(line.trimEnd());
      line = tk.trimStart();
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line.trim()) lines.push(line.trimEnd());
  if (lines.length === maxLines && tokens.join('').length > lines.join('').length + 1) {
    let l = lines[maxLines - 1];
    while (l && ctx.measureText(`${l}…`).width > maxW) l = l.slice(0, -1);
    lines[maxLines - 1] = `${l}…`;
  }
  return lines;
}

function drawCard(cv: HTMLCanvasElement, it: Item, row: Row, img: HTMLImageElement | null) {
  const ctx = cv.getContext('2d')!;
  const w = cv.width;
  const h = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f5f1ea';
  ctx.fillRect(0, 0, w, h);
  if (it.tex && !img) {
    // 照片加载中：只画编号
    ctx.strokeStyle = 'rgba(29, 27, 24, 0.18)';
    ctx.strokeRect(18.5, 18.5, w - 37, h - 37);
    ctx.fillStyle = '#9a9184';
    ctx.font = `600 30px ${FONT_D}`;
    ctx.textAlign = 'center';
    ctx.fillText(it.no, w / 2, h / 2 + 10);
    ctx.textAlign = 'left';
    return;
  }
  if (img) {
    const padX = 30;
    const padY = 26;
    const r = Math.min((w - padX * 2) / img.naturalWidth, (h - padY * 2) / img.naturalHeight);
    const iw = img.naturalWidth * r;
    const ih = img.naturalHeight * r;
    const ix = (w - iw) / 2;
    const iy = (h - ih) / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(60, 45, 30, 0.2)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#fff';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.restore();
    ctx.drawImage(img, ix, iy, iw, ih);
    return;
  }

  // 文字档案卡
  const m = 52;
  ctx.strokeStyle = 'rgba(29, 27, 24, 0.07)';
  ctx.lineWidth = 1;
  for (let y = 120; y < h - 30; y += 34) {
    ctx.beginPath();
    ctx.moveTo(m, y);
    ctx.lineTo(w - m, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(29, 27, 24, 0.22)';
  ctx.strokeRect(18.5, 18.5, w - 37, h - 37);

  ctx.fillStyle = '#8a8174';
  ctx.font = `600 22px ${FONT_D}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  (ctx as any).letterSpacing = '4px';
  ctx.fillText('STUDENT AWARD · TEXT RECORD', m, 72);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1d1b18';
  ctx.font = `700 30px ${FONT_D}`;
  (ctx as any).letterSpacing = '1px';
  ctx.fillText(it.no, w - m, 74);
  ctx.fillRect(m, 92, w - m * 2, 2);
  ctx.fillRect(m, 86, 12, 12);

  // 等级标签
  ctx.textAlign = 'left';
  ctx.font = `600 24px ${FONT_T}`;
  (ctx as any).letterSpacing = '2px';
  const tag = `${row.name}  ${row.en.toUpperCase()}`;
  const tw = ctx.measureText(tag).width;
  ctx.strokeStyle = '#b07d43';
  ctx.lineWidth = 2;
  ctx.strokeRect(m + 1, 122, tw + 32, 44);
  ctx.fillStyle = '#9a6a34';
  ctx.fillText(tag, m + 16, 153);

  // 奖项名称
  (ctx as any).letterSpacing = '0px';
  const zh = /[一-鿿]/.test(it.title);
  const size = zh ? 74 : 58;
  ctx.font = `700 ${size}px ${FONT_T}`;
  ctx.fillStyle = '#1c1a17';
  const lines = wrapText(ctx, it.title, w - m * 2 - 150, 3);
  let y = 256;
  for (const l of lines) {
    ctx.fillText(l, m, y);
    y += size * 1.28;
  }
  if (it.note) {
    ctx.font = `500 30px ${FONT_T}`;
    ctx.fillStyle = '#5e574c';
    for (const l of wrapText(ctx, it.note, w - m * 2 - 220, 2)) {
      ctx.fillText(l, m, y + 4);
      y += 36;
    }
  }

  // 授予单位与日期
  ctx.font = `500 25px ${FONT_T}`;
  ctx.fillStyle = '#3b362f';
  const issuer = wrapText(ctx, it.issuer, w - m * 2 - 200, 1)[0] ?? '';
  ctx.fillText(issuer, m, h - 92);
  ctx.font = `600 26px ${FONT_D}`;
  (ctx as any).letterSpacing = '2px';
  ctx.fillText(`${it.date}  ·  ${it.kind}`, m, h - 54);

  // 右下角的档案章
  const cx = w - 122;
  const cy = h - 112;
  ctx.strokeStyle = '#b98a52';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 64, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#a7763d';
  ctx.textAlign = 'center';
  ctx.font = `700 26px ${FONT_D}`;
  (ctx as any).letterSpacing = '2px';
  ctx.fillText('VCID', cx, cy + 4);
  ctx.font = `600 12px ${FONT_D}`;
  (ctx as any).letterSpacing = '4px';
  ctx.fillText('AWARD', cx, cy + 26);
  (ctx as any).letterSpacing = '0px';
  ctx.textAlign = 'left';
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function mount(root: HTMLElement) {
  const payload: Payload = JSON.parse(root.querySelector('[data-rl-data]')?.textContent || '{}');
  const { items, rows, text } = payload;
  if (!items?.length) return;
  const R = rows.length;

  const stage = root.querySelector<HTMLElement>('[data-rl-stage]')!;
  const canvas = root.querySelector<HTMLCanvasElement>('[data-rl-canvas]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqNarrow = matchMedia('(max-width: 760px)');
  const touch = matchMedia('(hover: none)').matches;
  let narrow = mqNarrow.matches;

  // ---------- 渲染器与场景
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !narrow, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = !narrow;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const fog = new THREE.Fog(BG, 60, 110);
  scene.fog = fog;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(19, 1, 1, 500);

  scene.add(new THREE.HemisphereLight(0xfffaf2, 0xb7aea1, 0.55));
  const key = new THREE.DirectionalLight(0xfff1de, 1.75);
  key.position.set(11, 18, 13);
  key.castShadow = !narrow;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xe8eef6, 0.32);
  fill.position.set(-12, 7, -6);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xd8d1c5, roughness: 1, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- 阵列：每排的奖状居中排列，相邻奖状间隔 STEP 格空白档案
  const laneZ = (lane: number) => (lane - (R - 1) / 2) * LZ;
  const itemI: number[] = [];
  const certAt = new Map<string, number>();
  rows.forEach((_, ri) => {
    const ks = items.map((it, k) => (it.row === ri ? k : -1)).filter((k) => k >= 0);
    ks.forEach((k, c) => {
      const i = c * STEP - Math.floor(((ks.length - 1) * STEP) / 2);
      itemI[k] = i;
      certAt.set(`${ri}:${i}`, k);
    });
  });
  const NS = narrow ? 24 : 44;
  type Slot = { lane: number; i: number; x: number; z: number; cert: number; h: number; seed: number };
  const slots: Slot[] = [];
  for (let lane = -EXTRA; lane < R + EXTRA; lane++)
    for (let i = -NS; i <= NS; i++)
      slots.push({ lane, i, x: i * S, z: laneZ(lane), cert: certAt.get(`${lane}:${i}`) ?? -1, h: 0, seed: Math.random() * 6.28 });
  const itemSlot = items.map((_, k) => slots.findIndex((s) => s.cert === k));

  const slabMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.46, metalness: 0 });
  slabMat.onBeforeCompile = patchAo;
  slabMat.customProgramCacheKey = () => 'rl-slab';
  const slabs = new THREE.InstancedMesh(new RoundedBoxGeometry(T, H, W, 2, 0.05), slabMat, slots.length);
  slabs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  slabs.castShadow = slabs.receiveShadow = !narrow;
  slots.forEach((s, k) => slabs.setColorAt(k, s.cert >= 0 ? C_CERT : C_FILL));
  scene.add(slabs);

  // 卡片前上角的小标记：空白档案为深灰，奖状为琥珀色，选中时更亮
  const marks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.075, 0.34), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }), slots.length);
  marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  slots.forEach((s, k) => marks.setColorAt(k, s.cert >= 0 ? C_MARK_CERT : C_MARK));
  scene.add(marks);
  const markLocal = new THREE.Matrix4().makeTranslation(T / 2 + 0.012, H / 2 - 0.17, W / 2 - 0.45);

  // 射线拾取用的低面数代理，和档案卡共用实例矩阵
  const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(T, H, W), new THREE.MeshBasicMaterial(), slots.length);
  pick.instanceMatrix = slabs.instanceMatrix;
  pick.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  // 证书面
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const faceW = W * 0.86;
  const faceH = H * 0.8;
  const faceGeo = new THREE.PlaneGeometry(faceW, faceH);
  const faceLocal = new THREE.Matrix4().compose(
    new THREE.Vector3(T / 2 + 0.006, -0.02, 0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2),
    new THREE.Vector3(1, 1, 1),
  );
  const faces = items.map((it) => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = Math.round((1024 * faceH) / faceW);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, maxAniso);
    const { mat, uniforms } = faceMaterial(tex);
    const mesh = new THREE.Mesh(faceGeo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = !narrow;
    scene.add(mesh);
    return { cv, tex, mesh, uniforms, lift: 0, vel: 0, reveal: 0 };
  });
  const paint = (k: number, img: HTMLImageElement | null) => {
    drawCard(faces[k].cv, items[k], rows[items[k].row], img);
    faces[k].tex.needsUpdate = true;
  };
  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(() => {
    items.forEach((it, k) => !it.tex && paint(k, null));
    // 字体载入后重新量一次界面文字的宽度
    labelW = laneLabels.map((el) => el.offsetWidth);
    tagDirty = true;
  });
  items.forEach((it, k) => {
    if (!it.tex) return;
    paint(k, null);
    loadImage(it.tex)
      .then((img) => paint(k, img))
      .catch(() => {
        // 照片加载失败时改画文字档案
        it.tex = '';
        paint(k, null);
      });
  });

  // ---------- 镜头取景：让所有奖状（含抬起高度）落在画面中预留的区域内
  const target = new THREE.Vector3();
  const viewDir = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEVATION), Math.sin(ELEVATION), Math.cos(AZIMUTH) * Math.cos(ELEVATION));
  const UP = new THREE.Vector3(0, 1, 0);
  let camDist = 60;
  let baseTarget = new THREE.Vector3();
  let panX = 0;
  let stageW = 1;
  let stageH = 1;
  const certX = itemI.map((i) => i * S);
  function fit() {
    statsRight = statsEl ? statsEl.offsetLeft + statsEl.offsetWidth : 0;
    infoLeft = info.offsetLeft;
    labelW = laneLabels.map((el) => el.offsetWidth);
    tagDirty = true;
    stageW = Math.max(1, stage.clientWidth);
    stageH = Math.max(1, stage.clientHeight);
    renderer.setSize(stageW, stageH, false);
    camera.aspect = stageW / stageH;
    camera.fov = narrow ? 24 : 19;
    camera.updateProjectionMatrix();
    const span = narrow ? 2.6 : 0;
    const x0 = narrow ? -span : Math.min(...certX) - 1.2;
    const x1 = narrow ? span : Math.max(...certX) + 1.2;
    const z0 = laneZ(0) - W / 2;
    const z1 = laneZ(R - 1) + W / 2;
    const y1 = H + 0.8;
    const fwd = viewDir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const center = new THREE.Vector3((x0 + x1) / 2, y1 / 2, (z0 + z1) / 2);
    let r0 = Infinity;
    let r1 = -Infinity;
    let u0 = Infinity;
    let u1 = -Infinity;
    for (const x of [x0, x1]) for (const y of [0, y1]) for (const z of [z0, z1]) {
      const v = new THREE.Vector3(x, y, z).sub(center);
      const a = v.dot(right);
      const b = v.dot(up);
      r0 = Math.min(r0, a);
      r1 = Math.max(r1, a);
      u0 = Math.min(u0, b);
      u1 = Math.max(u1, b);
    }
    // 画面中留给阵列的区域（NDC）：桌面左侧放统计、右侧放档案信息，手机端全幅
    const infoW = narrow ? 0 : info.offsetWidth + 40;
    const winR = Math.min(0.5, 1 - (2 * infoW) / stageW);
    const win = narrow ? { l: -0.9, r: 0.9, b: -0.86, t: 0.8 } : { l: -0.5, r: winR, b: -0.7, t: 0.5 };
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    camDist = Math.max((r1 - r0) / (tanH * (win.r - win.l)), (u1 - u0) / (tanV * (win.t - win.b))) * 1.04;
    const cx = (win.l + win.r) / 2;
    const cy = (win.b + win.t) / 2;
    baseTarget = center
      .clone()
      .addScaledVector(right, (r0 + r1) / 2 - cx * camDist * tanH)
      .addScaledVector(up, (u0 + u1) / 2 - cy * camDist * tanV);
    fog.near = camDist + 4;
    fog.far = camDist + 40;
    placeCamera();
  }
  function placeCamera() {
    target.copy(baseTarget);
    target.x += panX;
    camera.position.copy(target).addScaledVector(viewDir, camDist);
    camera.lookAt(target);
    key.position.set(target.x + 11, 18, target.z + 13);
    key.target.position.copy(target);
    camera.updateMatrixWorld();
  }

  // ---------- 界面
  const $ = <E extends Element = HTMLElement>(sel: string) => root.querySelector<E>(sel);
  const fields: Record<string, HTMLElement | null> = {};
  root.querySelectorAll<HTMLElement>('[data-rl-f]').forEach((el) => (fields[el.dataset.rlF!] = el));
  const setF = (k: string, v: string) => {
    const el = fields[k];
    if (el && el.textContent !== v) el.textContent = v;
  };
  const tag = $('[data-rl-tag]')!;
  const info = $('[data-rl-info]')!;
  const body = $('[data-rl-body]')!;
  const openBtn = $<HTMLButtonElement>('[data-rl-open]')!;
  const withheld = $('[data-rl-withheld]')!;
  const ticks = $('[data-rl-ticks]')!;
  const leader = $<SVGSVGElement>('[data-rl-leader]')!;
  const leaderPath = leader.querySelector('path')!;
  const leaderDot = leader.querySelector('circle')!;
  const laneLabels = [...root.querySelectorAll<HTMLElement>('[data-rl-lane]')];
  const statBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-rl-row]')];
  const featBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-rl-pick]')];
  const hint = $('[data-rl-hint]');
  if (hint && touch) hint.textContent = text.hintTouch;

  let sel = -1;
  let shownRow = -1;
  let tagDirty = true;
  function updateHud() {
    const it = items[sel];
    const row = rows[it.row];
    setF('level', row.name);
    setF('no', it.no);
    setF('title', it.title);
    setF('tagno', it.no);
    setF('tagtitle', it.title);
    setF('taglevel', row.name);
    setF('note', it.note);
    if (fields.note) fields.note.hidden = !it.note;
    setF('date', it.date);
    setF('kind', it.kind);
    setF('issuer', it.issuer);
    setF('col', pad2(it.col + 1));
    setF('cols', pad2(row.count));
    setF('rowno', pad2(it.row + 1));
    setF('rowname', row.name);
    setF('rowen', row.en);
    openBtn.hidden = !it.image;
    withheld.hidden = !!it.image;
    openBtn.dataset.zoom = it.image;
    openBtn.dataset.caption = it.title;
    if (shownRow !== it.row) {
      shownRow = it.row;
      ticks.replaceChildren(...Array.from({ length: row.count }, () => document.createElement('i')));
    }
    [...ticks.children].forEach((el, i) => el.classList.toggle('is-on', i === it.col));
    statBtns.forEach((b, i) => b.classList.toggle('is-active', i === it.row));
    featBtns.forEach((b) => b.classList.toggle('is-active', Number(b.dataset.rlPick) === sel));
    laneLabels.forEach((l, i) => l.classList.toggle('is-active', i === it.row));
    body.classList.remove('is-swap');
    void body.offsetWidth;
    body.classList.add('is-swap');
    tagDirty = true;
  }

  // ---------- 选择
  type Ripple = { x: number; z: number; t0: number; amp: number };
  const ripples: Ripple[] = [];
  let clock = 0;
  let lastInput = -10;
  let tourAt = 0;
  function select(k: number) {
    if (k === sel || k < 0 || k >= items.length) return;
    if (sel >= 0) marks.setColorAt(itemSlot[sel], C_MARK_CERT);
    sel = k;
    marks.setColorAt(itemSlot[sel], C_MARK_SEL);
    if (marks.instanceColor) marks.instanceColor.needsUpdate = true;
    const s = slots[itemSlot[k]];
    if (!reduce) {
      ripples.push({ x: s.x, z: s.z, t0: clock, amp: 0.34 });
      if (ripples.length > 3) ripples.shift();
    }
    updateHud();
  }
  const inRow = (r: number) => items.map((it, k) => (it.row === r ? k : -1)).filter((k) => k >= 0);
  function step(d: number) {
    const ks = inRow(items[sel].row);
    select(ks[(ks.indexOf(sel) + d + ks.length) % ks.length]);
  }
  function rowStep(d: number) {
    const r = (items[sel].row + d + R) % R;
    const x = itemI[sel];
    const ks = inRow(r);
    select(ks.reduce((best, k) => (Math.abs(itemI[k] - x) < Math.abs(itemI[best] - x) ? k : best), ks[0]));
  }
  const openCurrent = () => {
    if (!openBtn.hidden) openBtn.click();
  };
  const touched = () => {
    lastInput = clock;
  };

  root.querySelectorAll<HTMLButtonElement>('[data-rl-step]').forEach((b) =>
    b.addEventListener('click', () => {
      touched();
      step(Number(b.dataset.rlStep));
    }),
  );
  root.querySelectorAll<HTMLButtonElement>('[data-rl-rowstep]').forEach((b) =>
    b.addEventListener('click', () => {
      touched();
      rowStep(Number(b.dataset.rlRowstep));
    }),
  );
  let hovering = false;
  root.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') hovering = true;
  });
  root.addEventListener('pointerleave', () => (hovering = false));
  let hlLane = -1;
  statBtns.forEach((b, i) => {
    b.addEventListener('mouseenter', () => (hlLane = i));
    b.addEventListener('mouseleave', () => (hlLane = -1));
    b.addEventListener('click', () => {
      touched();
      if (items[sel].row !== i) select(inRow(i)[0]);
    });
  });
  featBtns.forEach((b) => {
    const pickIt = () => {
      touched();
      select(Number(b.dataset.rlPick));
    };
    b.addEventListener('click', pickIt);
    b.addEventListener('mouseenter', pickIt);
  });
  stage.addEventListener('keydown', (e) => {
    const map: Record<string, () => void> = {
      ArrowLeft: () => step(-1),
      ArrowRight: () => step(1),
      ArrowUp: () => rowStep(-1),
      ArrowDown: () => rowStep(1),
      Enter: openCurrent,
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    touched();
    fn();
  });

  // ---------- 指针：鼠标悬停即选择；触摸轻点选择，再点一次打开证书
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -H * 0.55);
  const pointer = { x: 0, z: 0, active: false, energy: 0, dirty: false };
  const tmpV = new THREE.Vector3();
  let hoverK = -1;
  function setNdc(e: PointerEvent) {
    const r = stage.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  // 返回指针下的奖状（指在同一横排附近的空白档案上时，取最近的奖状）
  function probe() {
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(pick, false)[0];
    let slot = -1;
    if (hit && hit.instanceId !== undefined) {
      slot = hit.instanceId;
      pointer.x = hit.point.x;
      pointer.z = slots[slot].z;
    } else if (ray.ray.intersectPlane(floorPlane, tmpV)) {
      pointer.x = tmpV.x;
      pointer.z = tmpV.z;
    }
    if (slot < 0) return -1;
    const s = slots[slot];
    if (s.cert >= 0) return s.cert;
    if (s.lane < 0 || s.lane >= R) return -1;
    let best = -1;
    let bestD = STEP * 1.5 + 0.01;
    for (const k of inRow(s.lane)) {
      const d = Math.abs(itemI[k] - s.i);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }
  // 鼠标停稳（0.14 秒内移动不超过 6px）才切换选中，划过其他奖状去点说明栏时不会被打断
  const rest = { x: 0, y: 0, t: 0 };
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    setNdc(e);
    pointer.active = true;
    pointer.dirty = true;
    if (Math.hypot(e.clientX - rest.x, e.clientY - rest.y) > 6) {
      rest.x = e.clientX;
      rest.y = e.clientY;
      rest.t = clock;
    }
    touched();
  });
  stage.addEventListener('pointerleave', () => {
    pointer.active = false;
    hoverK = -1;
  });
  let downAt: { x: number; y: number } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
  });
  stage.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 10) return;
    downAt = null;
    setNdc(e);
    touched();
    const k = probe();
    if (k < 0) return;
    if (k === sel) openCurrent();
    else select(k);
    if (e.pointerType === 'touch') {
      pointer.active = true;
      window.setTimeout(() => (pointer.active = false), 900);
    }
  });

  // ---------- 动画
  const m4 = new THREE.Matrix4();
  const mm = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const AX_Y = new THREE.Vector3(0, 1, 0);
  const AX_Z = new THREE.Vector3(0, 0, 1);
  const anchor = new THREE.Vector3();
  const call = { x: 0, y: 0, ready: false };
  let breathe = 0;
  let shoulder = 0;
  let introT = reduce ? 99 : 0;

  function project(v: THREE.Vector3) {
    v.project(camera);
    return { x: (v.x * 0.5 + 0.5) * stageW, y: (-v.y * 0.5 + 0.5) * stageH };
  }

  function update(dt: number) {
    clock += dt;
    introT += dt;
    if (pointer.dirty) {
      pointer.dirty = false;
      hoverK = probe();
    }
    if (pointer.active && hoverK >= 0 && hoverK !== sel && clock - rest.t > 0.14) select(hoverK);
    const idle = clock - lastInput;
    pointer.energy += ((pointer.active ? 1 : 0) - pointer.energy) * (1 - Math.exp(-dt * 3.2));
    breathe += ((idle > 2.5 && !reduce ? 1 : 0) - breathe) * (1 - Math.exp(-dt * 1.2));
    shoulder += (1 - shoulder) * (1 - Math.exp(-dt * 4));
    // 无人操作（鼠标也不在区块上）时轮播高等级奖状
    if (!reduce && !hovering && idle > 7 && clock - tourAt > 4.6 && featBtns.length) {
      tourAt = clock;
      const f = featBtns.map((b) => Number(b.dataset.rlPick));
      select(f[(f.indexOf(sel) + 1) % f.length]);
    }
    // 奖状抬起：临界阻尼弹簧
    for (let k = 0; k < faces.length; k++) {
      const f = faces[k];
      const goal = k === sel ? 1 : 0;
      const w = goal ? 7.5 : 9;
      const a = w * w * (goal - f.lift) - 2 * w * f.vel;
      f.vel += a * dt;
      f.lift += f.vel * dt;
      if (reduce) f.lift = goal;
      const rv = k === sel && f.lift > 0.62 ? 1 : 0;
      f.reveal += (rv - f.reveal) * (1 - Math.exp(-dt * (rv ? 2.4 : 6)));
      f.uniforms.uReveal.value = f.reveal;
    }
    // 手机端镜头横向跟随选中的奖状
    const goalPan = narrow && sel >= 0 ? itemI[sel] * S : 0;
    if (Math.abs(goalPan - panX) > 1e-4) {
      panX += (goalPan - panX) * (1 - Math.exp(-dt * 4));
      placeCamera();
    }

    const sS = sel >= 0 ? slots[itemSlot[sel]] : null;
    const kSmooth = 1 - Math.exp(-dt * 7);
    for (let k = 0; k < slots.length; k++) {
      const s = slots[k];
      let goal = s.cert >= 0 ? 0.07 : 0;
      if (pointer.energy > 0.002) {
        const dx = s.x - pointer.x;
        const dz = s.z - pointer.z;
        goal += pointer.energy * 0.6 * Math.exp(-(dx * dx) / 6.5 - (dz * dz) / 11.5) * (s.cert >= 0 ? 1.45 : 1);
      }
      if (sS) {
        const dl = Math.abs(s.lane - sS.lane);
        if (dl <= 1) {
          const di = s.i - sS.i;
          goal += shoulder * 0.48 * Math.exp(-(di * di) / 20) * (dl === 0 ? 1 : 0.32);
        }
      }
      if (hlLane === s.lane) goal += 0.26 * (s.cert >= 0 ? 1.5 : 1);
      s.h += (goal - s.h) * kSmooth;
      let y = s.h;
      for (const r of ripples) {
        const age = clock - r.t0;
        if (age > 3.2) continue;
        const d = Math.hypot(s.x - r.x, (s.z - r.z) * 0.72);
        const u = d - age * 6.2;
        y += r.amp * Math.exp(-(u * u) / 2.4) * Math.cos(u * 2.3) * Math.exp(-age / 1.4) * Math.min(1, d / 1.2);
      }
      if (breathe > 0.001)
        y += breathe * (0.045 * Math.sin(clock * 0.78 + s.i * 0.31 + s.lane * 1.3) + 0.032 * Math.sin(clock * 0.48 - s.i * 0.19 + s.lane * 0.5 + s.seed));
      if (introT < 3) {
        const delay = (s.x + NS * S) * 0.022 + (s.lane + EXTRA) * 0.05;
        y -= (1 - easeOut((introT - delay) / 0.9)) * (H + 0.5);
      }
      let rot = 0;
      let sc = 1;
      if (s.cert >= 0) {
        const lp = faces[s.cert].lift;
        y += lp * LIFT;
        rot = smooth(0.7, 1, lp);
        sc = 1 + (SEL_SCALE - 1) * rot;
      }
      pos.set(s.x, (H / 2) * sc + y, s.z);
      if (rot > 0) {
        qYaw.setFromAxisAngle(AX_Y, FACE_YAW * rot);
        qTilt.setFromAxisAngle(AX_Z, FACE_TILT * rot);
        quat.multiplyQuaternions(qYaw, qTilt);
      } else quat.identity();
      scl.setScalar(sc);
      m4.compose(pos, quat, scl);
      slabs.setMatrixAt(k, m4);
      mm.multiplyMatrices(m4, markLocal);
      marks.setMatrixAt(k, mm);
      if (s.cert >= 0) {
        const mesh = faces[s.cert].mesh;
        mesh.matrix.multiplyMatrices(m4, faceLocal);
        mesh.matrixWorldNeedsUpdate = true;
      }
    }
    slabs.instanceMatrix.needsUpdate = true;
    marks.instanceMatrix.needsUpdate = true;
    for (let i = ripples.length - 1; i >= 0; i--) if (clock - ripples[i].t0 > 3.2) ripples.splice(i, 1);
  }

  // 选中奖状旁边的名称标签与引线；各排的等级标签对齐在阵列左侧
  const laneX = Math.min(...certX) - 1.6;
  const statsEl = root.querySelector<HTMLElement>('.rl-stats');
  let statsRight = 0;
  let infoLeft = 0;
  let labelW: number[] = [];
  let tagMax = 0;
  let tagW = 0;
  let tagH = 0;
  function updateOverlay(dt: number) {
    if (narrow || sel < 0) return;
    const s = slots[itemSlot[sel]];
    slabs.getMatrixAt(itemSlot[sel], m4);
    const a = project(anchor.set(T / 2, H / 2, -W / 2).applyMatrix4(m4));
    // 标签不压住右侧的档案信息栏和左侧的统计栏：右边放不下改到奖状左侧，两边都窄时缩短标签（名称省略）
    const limit = infoLeft - 18;
    const b = project(anchor.set(T / 2, H / 2, W / 2).applyMatrix4(m4));
    const roomR = limit - (a.x + 30);
    const roomL = b.x - 30 - (statsRight + 16);
    const max = Math.round(Math.max(160, Math.min(380, Math.max(roomR, roomL))) / 8) * 8;
    if (max !== tagMax) {
      tagMax = max;
      tag.style.maxWidth = `${max}px`;
      tagDirty = true;
    }
    if (tagDirty) {
      tagDirty = false;
      tagW = tag.offsetWidth;
      tagH = tag.offsetHeight;
    }
    const tw = tagW;
    const th = tagH;
    let flip = false;
    let tx = a.x + 30;
    if (tw > roomR && roomL > roomR) {
      tx = b.x - 30 - tw;
      flip = true;
      a.x = b.x;
      a.y = b.y;
    }
    const ty = Math.min(Math.max(a.y - th - 26, 8), stageH - th - 8);
    const k = call.ready ? 1 - Math.exp(-dt * 10) : 1;
    call.x += (tx - call.x) * k;
    call.y += (ty - call.y) * k;
    call.ready = true;
    tag.style.transform = `translate3d(${call.x.toFixed(1)}px, ${call.y.toFixed(1)}px, 0)`;
    const ey = call.y + th / 2;
    const ex = flip ? call.x + tw + 6 : call.x - 6;
    const mx = flip ? Math.max(ex + 10, a.x - 22) : Math.min(ex - 10, a.x + 22);
    leaderPath.setAttribute('d', `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${mx.toFixed(1)} ${ey.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}`);
    leaderDot.setAttribute('cx', a.x.toFixed(1));
    leaderDot.setAttribute('cy', a.y.toFixed(1));
    const vis = String(smooth(0.55, 0.95, faces[s.cert].lift));
    leader.style.opacity = vis;
    tag.style.opacity = vis;
    const minX = statsRight + 30;
    // 抬起的奖状在屏幕上占的范围（四个角）
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let by0 = Infinity;
    let by1 = -Infinity;
    for (const [cy, cz] of [[-H / 2, -W / 2], [-H / 2, W / 2], [H / 2, -W / 2], [H / 2, W / 2]]) {
      const c = project(anchor.set(T / 2, cy, cz).applyMatrix4(m4));
      bx0 = Math.min(bx0, c.x);
      bx1 = Math.max(bx1, c.x);
      by0 = Math.min(by0, c.y);
      by1 = Math.max(by1, c.y);
    }
    laneLabels.forEach((el, r) => {
      let p = project(anchor.set(laneX, H + 0.3, laneZ(r) + W / 2));
      const need = minX + labelW[r] - p.x;
      if (need > 0) {
        const q = project(anchor.set(laneX + 1, H + 0.3, laneZ(r) + W / 2));
        p = project(anchor.set(laneX + need / Math.max(1, q.x - p.x), H + 0.3, laneZ(r) + W / 2));
      }
      // 标签右端对齐锚点、上下居中（偏移写在 transform 里：单独的 CSS translate 属性会被生产构建的压缩合并掉）
      el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-100%, -50%)`;
      const left = p.x - labelW[r];
      const underCard = p.x > bx0 - 6 && left < bx1 + 6 && p.y > by0 - 10 && p.y < by1 + 10;
      const underTag = p.x > call.x - 6 && left < call.x + tw + 6 && p.y > call.y - 10 && p.y < call.y + th + 10;
      const hidden = underCard || underTag;
      const op = hidden ? '0.08' : '';
      if (el.style.opacity !== op) el.style.opacity = op;
    });
  }

  // ---------- 循环：区块不在视口或页面隐藏时暂停
  let running = false;
  let raf = 0;
  let last = 0;
  let firstFrame = true;
  // 自适应画质：持续掉帧时先降低像素密度，再关闭阴影
  let perfN = 0;
  let perfSum = 0;
  let perfLevel = 0;
  function adapt(rawDt: number) {
    // 开场前两秒在编译着色器、加载贴图，不计入
    if (perfLevel >= 2 || rawDt > 0.25 || clock < 2) return;
    perfN++;
    perfSum += rawDt;
    if (perfN < 90) return;
    const avg = perfSum / perfN;
    perfN = 0;
    perfSum = 0;
    if (avg < 0.024) return;
    perfLevel++;
    if (perfLevel === 1 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(1);
      fit();
    } else {
      perfLevel = 2;
      renderer.shadowMap.enabled = false;
      key.castShadow = false;
      slabs.castShadow = false;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
  }

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const raw = last ? (now - last) / 1000 : 0.016;
    const dt = Math.min(0.05, raw);
    last = now;
    adapt(raw);
    update(dt);
    renderer.render(scene, camera);
    updateOverlay(dt);
    if (firstFrame) {
      firstFrame = false;
      root.classList.add('is-ready');
    }
    raf = requestAnimationFrame(frame);
  }
  const play = () => {
    if (!running || raf || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    play();
  }).observe(root);
  document.addEventListener('visibilitychange', play);
  new ResizeObserver(() => fit()).observe(stage);
  mqNarrow.addEventListener('change', () => {
    narrow = mqNarrow.matches;
    tag.style.transform = '';
    call.ready = false;
    fit();
  });

  root.classList.add('is-3d');
  fit();
  select(payload.start >= 0 ? payload.start : 0);
  // 首屏先让选中的奖状停在抬起位置，避免开场就是一张平铺的阵列
  if (reduce) faces.forEach((f, k) => (f.lift = k === sel ? 1 : 0));
}
