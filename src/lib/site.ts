// 读取 src/data/*.yaml 中的内容，并提供页面通用的小工具
import { existsSync, readFileSync } from 'node:fs';
import { join as joinPath } from 'node:path';
import { parse } from 'yaml';
import siteRaw from '../data/site.yaml?raw';
import researchRaw from '../data/research.yaml?raw';
import membersRaw from '../data/members.yaml?raw';
import publicationsRaw from '../data/publications.yaml?raw';
import newsRaw from '../data/news.yaml?raw';
import joinRaw from '../data/join.yaml?raw';
import patentsRaw from '../data/patents.yaml?raw';
import categoriesRaw from '../data/categories.yaml?raw';
import lifeRaw from '../data/life.yaml?raw';
import projectsRaw from '../data/projects.yaml?raw';
import awardsRaw from '../data/awards.yaml?raw';
import exchangeRaw from '../data/exchange.yaml?raw';

export type Lang = 'zh' | 'en';
/** 双语文本：可以是普通字符串，也可以是 { zh, en } */
export type Text = string | number | { zh?: string; en?: string } | null | undefined;
type TextList = string[] | { zh?: string[]; en?: string[] } | null | undefined;

export interface Person {
  name: Text;
  aliases?: string[];
  photo?: string;
  email?: string;
  since?: number | string;
  topic?: Text;
  [key: string]: any;
}

export interface Publication {
  title: string;
  authors?: string[];
  venue?: string;
  short?: string;
  year: number;
  volume?: string;
  doi?: string;
  url?: string;
  pdf?: string;
  code?: string;
  /** 可选：「研究方向」页「相关论文」列表用的研究方向 id */
  direction?: string;
  /** 大类：categories.yaml 中的 id，按论文实际内容划分，用于论文页的分类筛选 */
  category?: string;
  /** 具体研究主题，显示为论文条目上的分类标签 */
  topic?: Text;
  featured?: boolean;
  /** 期刊影响因子（JCR），用于论文页最前面「高影响因子论文」（共 10 篇）的排序 */
  impact?: number;
  /** CCF 推荐目录等级；CCF-A / B 类会议论文也参与「高影响因子论文」的排序 */
  ccf?: 'A' | 'B' | 'C';
  /** 在「高影响因子论文」中排在最后（按课题组要求） */
  top_last?: boolean;
  badge?: Text;
  /** journal / conference / preprint；不填时根据 venue 自动判断 */
  type?: string;
  /** 论文的核心结构图（显示在首页轮播图中） */
  figure?: string;
  figure_caption?: Text;
  /** slide: true 时出现在首页轮播图中（按 impact 从高到低） */
  slide?: boolean;
  /** 轮播图中显示的一句话简介 */
  summary?: Text;
  /** 是否为课题组主导的论文；不填时按作者自动判断（见 isLabLed） */
  lab_lead?: boolean;
}

export interface Patent {
  title: Text;
  inventors?: TextList;
  /** 授权公告号（B）或申请公布号（A）；已受理尚未公开的申请没有 */
  number?: string;
  /** 申请号；授权后专利号为 ZL + 申请号 */
  app_no?: string;
  filed: string;
  published?: string;
  granted?: string;
  status: 'granted' | 'examining' | 'published' | 'accepted';
  /** 专利类型：不写为发明专利；utility 为实用新型（不计入「授权发明专利」） */
  kind?: 'invention' | 'utility';
  /** 保护期届满日期 */
  expired?: string;
  /** 大类：categories.yaml 中的 id，按专利实际内容划分，用于专利页的分类筛选 */
  category?: string;
  /** 具体技术主题，显示为专利条目上的分类标签 */
  topic?: Text;
  url?: string;
}

/** 读取 public/ 下 PNG / JPEG 图片的宽高（构建时使用，用于选择轮播图排版） */
export function imageSize(publicPath?: string): { width: number; height: number } | null {
  if (!publicPath || /^(https?:)?\/\//.test(publicPath)) return null;
  const file = joinPath(process.cwd(), 'public', publicPath);
  if (!existsSync(file)) return null;
  const buf = readFileSync(file);
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
      off += 2 + buf.readUInt16BE(off + 2);
    }
  }
  return null;
}

const CONF = /conference|proceedings|symposium|workshop|congress|lecture notes|communications in computer|transactions on information and communication technologies|\((cvpr|iccv|eccv|aaai|icassp|icme|acm mm|mmasia|igarss|cicc|iscas|ispacs)\)/i;

export function pubType(p: Publication): 'journal' | 'conference' | 'preprint' {
  if (p.type === 'journal' || p.type === 'conference' || p.type === 'preprint') return p.type;
  if (/arxiv|preprint/i.test(p.venue ?? '')) return 'preprint';
  return CONF.test(p.venue ?? '') ? 'conference' : 'journal';
}

export const site: any = parse(siteRaw) ?? {};
export const research: any[] = parse(researchRaw) ?? [];
/** 论文和专利的分类（大类） */
export const categories: any[] = parse(categoriesRaw) ?? [];
export const members: any = parse(membersRaw) ?? {};
export const join: any = parse(joinRaw) ?? {};

export const publications: Publication[] = ((parse(publicationsRaw) ?? []) as Publication[])
  .map((p) => ({ ...p, year: Number(p.year) }))
  .sort((a, b) => b.year - a.year);

/** 各处显示的「学术论文」数量（site.yaml 的 papers_total；不填时为论文列表条数） */
export const papersTotal = {
  value: Number(site.papers_total?.value ?? publications.length),
  suffix: String(site.papers_total?.suffix ?? ''),
};
export const papersLabel = `${papersTotal.value}${papersTotal.suffix}`;
/** 科研成果页只展示这一年及以后的论文（site.yaml 的 papers_since） */
export const papersSince = Number(site.papers_since ?? 0);

export const patents: Patent[] = ((parse(patentsRaw) ?? []) as Patent[])
  .map((p) => ({
    ...p,
    filed: String(p.filed ?? ''),
    published: p.published ? String(p.published) : '',
    granted: p.granted ? String(p.granted) : '',
    expired: p.expired ? String(p.expired) : '',
  }))
  .sort((a, b) => b.filed.localeCompare(a.filed));

/** 已授权的发明专利（首页、导师页、专利页的「授权发明专利」统计都用它） */
export const grantedInventions = patents.filter((p) => p.status === 'granted' && p.kind !== 'utility');

/** 专利详情页链接（默认指向 Google Patents）；尚未公开的申请没有链接 */
export function patentUrl(p: Patent, lang: Lang): string {
  if (p.url) return p.url;
  return p.number ? `https://patents.google.com/patent/${p.number}/${lang === 'zh' ? 'zh' : 'en'}` : '';
}

export const life: any[] = parse(lifeRaw) ?? [];

// ---------- 科研项目、获奖、学术交流 ----------

const projectsData: any = parse(projectsRaw) ?? {};
const NOW = new Date().toISOString().slice(0, 7);
/** 科研项目（按开始时间倒序）；ongoing：结束时间晚于当前月份 */
export const projects: any[] = (projectsData.projects ?? [])
  .map((p: any) => ({ ...p, start: String(p.start ?? ''), end: String(p.end ?? ''), ongoing: !p.end || String(p.end) >= NOW }))
  .sort((a: any, b: any) => b.start.localeCompare(a.start));
export const applications: any[] = projectsData.applications ?? [];
/** 累计主持科研项目数（site.yaml 的 projects_led_total；不填时为「科研项目」页中主持的项目数） */
export const projectsLedTotal = Number(site.projects_led_total ?? projects.filter((p) => p.role === 'lead').length);

export const awards: any[] = ((parse(awardsRaw) ?? []) as any[])
  .map((a) => ({ ...a, date: String(a.date ?? '') }))
  .sort((a, b) => b.date.localeCompare(a.date));

const exchangeData: any = parse(exchangeRaw) ?? {};
const byDate = (a: any, b: any) => String(b.date ?? '').localeCompare(String(a.date ?? ''));
export const exchange = {
  reports: ((exchangeData.reports ?? []) as any[]).map((r) => ({ ...r, date: String(r.date ?? '') })).sort(byDate),
  talks: ((exchangeData.talks ?? []) as any[]).map((r) => ({ ...r, date: String(r.date ?? '') })).sort(byDate),
  conferences: (exchangeData.conferences ?? []) as any[],
  visits: (exchangeData.visits ?? []) as any[],
  service: (exchangeData.service ?? []) as any[],
};
/** 学术交流条目总数（显示在科研成果切换标签上） */
export const exchangeCount = Object.values(exchange).reduce((n, l) => n + l.length, 0);

export const news: any[] = ((parse(newsRaw) ?? []) as any[])
  .map((n) => ({ ...n, date: String(n.date ?? '') }))
  .sort((a, b) => b.date.localeCompare(a.date));

/** 取出当前语言的文本 */
export function t(v: Text, lang: Lang): string {
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return v[lang] ?? v.zh ?? v.en ?? '';
}

/** 取出当前语言的列表 */
export function list(v: TextList, lang: Lang): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return v[lang] ?? v.zh ?? v.en ?? [];
}

/** 按空行拆分段落 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// ---------- 链接 ----------

const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** 站内页面链接，例如 href('people', 'en') → /en/people/ */
export function href(path: string, lang: Lang): string {
  const clean = path.replace(/^\/+|\/+$/g, '');
  const prefix = lang === 'en' ? '/en' : '';
  return `${BASE}${prefix}/${clean ? `${clean}/` : ''}`;
}

/** public/ 下的静态文件链接；外部链接原样返回 */
export function asset(path?: string): string {
  if (!path) return '';
  if (/^(https?:)?\/\//.test(path)) return path;
  return `${BASE}/${path.replace(/^\/+/, '')}`;
}

/** 当前页面去掉 base 和语言前缀后的路径，例如 /en/people/ → people */
export function pageKey(pathname: string): string {
  let p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  p = p.replace(/^\/en(?=\/|$)/, '');
  return p.replace(/^\/+|\/+$/g, '');
}

/** 切换语言后对应页面的链接 */
export function switchLangHref(pathname: string, to: Lang): string {
  const key = pageKey(pathname).replace(/\.html$/, '');
  // 404 页只有一个版本，切换语言时回到对应语言的首页
  return href(key === '404' ? '' : key, to);
}

// ---------- 日期 ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dateParts(date: string) {
  const [y = '', m = '', d = ''] = String(date).split('-');
  return { y, m, d, month: MONTHS[Number(m) - 1] ?? m };
}

export function formatDate(date: string, lang: Lang): string {
  const { y, m, d, month } = dateParts(date);
  if (lang === 'zh') return [y, m, d].filter(Boolean).join('.');
  if (!m) return y;
  return d ? `${month} ${Number(d)}, ${y}` : `${month} ${y}`;
}

/** 新闻链接：page（站内页面，如 life#2026-graduation）> link（外部链接）> 新闻页 */
export function newsLink(n: any, lang: Lang): { url: string; external: boolean } {
  if (n.page) {
    const [path, hash] = String(n.page).split('#');
    return { url: `${href(path, lang)}${hash ? `#${hash}` : ''}`, external: false };
  }
  if (n.link) return { url: n.link, external: true };
  return { url: href('news', lang), external: false };
}

// ---------- 成员 ----------

export const pi: Person = members.pi ?? { name: '' };
export const groups: { role: Text; members: Person[] }[] = (members.groups ?? []).map((g: any) => ({
  ...g,
  members: g.members ?? [],
}));
export const alumni: any[] = members.alumni ?? [];

/** 当前成员（PI 在最前） */
export function currentPeople(): Person[] {
  return [pi, ...groups.flatMap((g) => g.members)];
}

/** 成员在论文作者列表中可能出现的写法：中英文名和 aliases */
function namesOf(p: Person): string[] {
  const name: any = p.name;
  const base = typeof name === 'string' ? [name] : name ? [name.en, name.zh] : [];
  return [...base, ...(p.aliases ?? [])].filter(Boolean);
}
const memberNames = new Set<string>([...currentPeople(), ...alumni].flatMap(namesOf));
const piNames = new Set<string>(namesOf(pi));

/** 解析作者：去掉 * / # 标记，并判断是否为课题组成员 */
export function splitAuthor(raw: string) {
  const s = String(raw).trim();
  const marks = s.match(/[*#]+$/)?.[0] ?? '';
  const name = s.slice(0, s.length - marks.length).trim();
  return { name, corr: marks.includes('*'), equal: marks.includes('#'), member: memberNames.has(name) };
}

export type Author = ReturnType<typeof splitAuthor>;

/**
 * 课题组主导的论文：同学（成员名单中除王老师以外的人）是第一或第二作者且王老师在作者中，或王老师是第一作者。
 * 同学包括 members.yaml 中的毕业校友；个别例外可在 publications.yaml 中用 lab_lead 手动指定
 */
export function isLabLed(p: Publication): boolean {
  if (typeof p.lab_lead === 'boolean') return p.lab_lead;
  const authors = (p.authors ?? []).map(splitAuthor);
  const isPi = (a: Author) => piNames.has(a.name);
  if (authors.length && isPi(authors[0])) return true;
  return authors.slice(0, 2).some((a) => a.member && !isPi(a)) && authors.some(isPi);
}

/** 作者太多时只显示前几位，并保留排在后面的课题组成员 */
export function displayAuthors(raw: string[] = [], max = 8): (Author | '…')[] {
  const all = raw.map(splitAuthor);
  if (all.length <= max + 2) return all;
  const shown: (Author | '…')[] = all.slice(0, max);
  const tailMembers = all.slice(max).filter((a) => a.member || a.corr);
  for (const a of tailMembers) shown.push('…', a);
  shown.push('…');
  return shown;
}

// ---------- 研究方向 ----------

export function directionById(id?: string) {
  return research.find((r) => r.id === id);
}

// ---------- 论文、专利分类 ----------

export function categoryById(id?: string) {
  return categories.find((c) => c.id === id);
}

export function categoryColor(id?: string): string {
  return categoryById(id)?.color ?? '#5b7bff';
}

/** 这些条目用到的分类（按 categories.yaml 的顺序），用于分类筛选按钮 */
export function categoriesOf(items: { category?: string }[]) {
  return categories.filter((c) => items.some((p) => p.category === c.id));
}

/** 某个方向下发表过的代表性期刊/会议简称 */
export function directionVenues(id: string, max = 4): string[] {
  const seen: string[] = [];
  for (const p of publications) {
    if (p.direction !== id || !p.short || p.short === 'arXiv' || seen.includes(p.short)) continue;
    seen.push(p.short);
  }
  return seen.slice(0, max);
}

// ---------- 头像 ----------

// 主题蓝系渐变，少量橙色点缀
const PALETTES: [string, string][] = [
  ['#2f86de', '#093b6d'],
  ['#0b5eb2', '#062a4f'],
  ['#4f9be3', '#0b5eb2'],
  ['#1c6cc0', '#0a3a6c'],
  ['#f57c40', '#d9622a'],
  ['#3a7fc8', '#123f6e'],
];

export function avatarColors(seed: string): [string, string] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

/** 头像文字：中文取姓名后两个字，英文取首字母 */
export function initials(name: Text, lang: Lang): string {
  const s = t(name, lang).trim();
  if (!s) return '?';
  // 占位名称，如「姓名 A」
  const tag = s.match(/\s([A-Za-z0-9]{1,2})$/);
  if (tag) return tag[1].toUpperCase();
  if (/[㐀-鿿]/.test(s)) {
    const chars = [...s.replace(/\s+/g, '')];
    return chars.length <= 2 ? chars.join('') : chars.slice(-2).join('');
  }
  return s
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
