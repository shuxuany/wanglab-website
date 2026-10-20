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
  direction?: string;
  featured?: boolean;
  badge?: Text;
  /** journal / conference / preprint；不填时根据 venue 自动判断 */
  type?: string;
  /** 论文的核心结构图（显示在首页轮播图中） */
  figure?: string;
  figure_caption?: Text;
  /** 是否出现在首页轮播图中；不填时与 featured 相同 */
  slide?: boolean;
}

export interface Patent {
  title: Text;
  inventors?: TextList;
  /** 授权公告号（B）或申请公布号（A） */
  number: string;
  /** 申请号；授权后专利号为 ZL + 申请号 */
  app_no?: string;
  filed: string;
  published?: string;
  granted?: string;
  status: 'granted' | 'examining' | 'published';
  direction?: string;
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
export const members: any = parse(membersRaw) ?? {};
export const join: any = parse(joinRaw) ?? {};

export const publications: Publication[] = ((parse(publicationsRaw) ?? []) as Publication[])
  .map((p) => ({ ...p, year: Number(p.year) }))
  .sort((a, b) => b.year - a.year);

export const patents: Patent[] = ((parse(patentsRaw) ?? []) as Patent[])
  .map((p) => ({
    ...p,
    filed: String(p.filed ?? ''),
    published: p.published ? String(p.published) : '',
    granted: p.granted ? String(p.granted) : '',
  }))
  .sort((a, b) => b.filed.localeCompare(a.filed));

/** 专利详情页链接（默认指向 Google Patents） */
export function patentUrl(p: Patent, lang: Lang): string {
  return p.url || `https://patents.google.com/patent/${p.number}/${lang === 'zh' ? 'zh' : 'en'}`;
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

const memberNames = new Set<string>();
for (const p of [...currentPeople(), ...alumni]) {
  const name = p.name;
  if (typeof name === 'string') memberNames.add(name);
  else if (name) [name.en, name.zh].forEach((n) => n && memberNames.add(n));
  (p.aliases ?? []).forEach((a: string) => memberNames.add(a));
}

/** 解析作者：去掉 * / # 标记，并判断是否为课题组成员 */
export function splitAuthor(raw: string) {
  const s = String(raw).trim();
  const marks = s.match(/[*#]+$/)?.[0] ?? '';
  const name = s.slice(0, s.length - marks.length).trim();
  return { name, corr: marks.includes('*'), equal: marks.includes('#'), member: memberNames.has(name) };
}

export type Author = ReturnType<typeof splitAuthor>;

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

export function directionColor(id?: string): string {
  return directionById(id)?.color ?? '#5b7bff';
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
