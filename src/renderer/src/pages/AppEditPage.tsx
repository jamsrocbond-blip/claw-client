import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, RefreshCw, AlertCircle, CheckCircle2,
  ClipboardList, Code2, FileText, Info, Plus, Trash2,
  ChevronDown, ChevronRight, Wand2, Eye, EyeOff,
  GripVertical, ToggleLeft, ToggleRight, Layers, BookOpen,
} from 'lucide-react';
import AgentLessonsPanel from '../components/AgentLessonsPanel';

// ─────────────────────────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────────────────────────

interface AppDetail {
  id: number; slug: string; name: string; version: string;
  description?: string; category?: string; author?: string;
  checklist?: ChecklistDef; skillDef?: string; reportTmpl?: string;
}
interface ChecklistDef { phases?: Phase[]; }
interface Phase { id: string; name: string; items: ChecklistItem[]; }
interface ChecklistItem {
  id: string; name: string; content_requirement?: string;
  format?: string; required?: boolean; match_keywords?: string[];
}

// Skill 步骤（结构化）
interface SkillStep {
  id: string;
  name: string;                    // 步骤名称，如"主体资格分析"
  searchKeywords: string;          // 检索关键词（逗号分隔）
  analysisPoints: string[];        // 分析要点（多选）
  outputField: string;             // 输出字段名
  pythonScript?: string;           // 可选 Python 脚本
  enabled: boolean;
}

// 报告章节（结构化）
interface ReportSection {
  id: string;
  title: string;                   // 章节标题
  moduleKey: string;               // 对应 skillOutput.modules 的 key
  fields: string[];                // 要展示的字段
  enabled: boolean;
  showTable: boolean;              // 是否用表格展示
}

type Tab = 'info' | 'checklist' | 'skill' | 'report' | 'lessons';

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'info',      label: '基本信息', icon: Info },
  { key: 'checklist', label: '资料清单', icon: ClipboardList },
  { key: 'skill',     label: '分析逻辑', icon: Code2 },
  { key: 'report',    label: '报告模板', icon: FileText },
  { key: 'lessons',   label: '经验沉淀', icon: BookOpen },
];

// 预置分析要点选项
const ANALYSIS_POINT_OPTIONS: Record<string, string[]> = {
  corporate: ['设立与存续合法性', '股东与股权结构', '公司治理', '历史沿革', '关联方关系'],
  assets: ['土地及不动产', '核心生产设备', '知识产权', '流动资产', '对外投资'],
  business: ['业务模式', '经营资质', '重大合同', '客户结构', '供应商关系'],
  debts: ['应付账款', '银行借款', '未决诉讼', '担保情况', '或有负债'],
  hr: ['人员规模', '劳动合同', '社保公积金', '薪酬福利', '竞业限制'],
  tax: ['财务核算', '税务合规', '税收优惠', '跨境交易', '政府补贴'],
  merger: ['税务情景对比', '资质转移分析', '多维度评分', '综合建议'],
  secret: ['秘点识别', '价值量化', '保密措施', '风险诊断', '整改建议'],
};

// 预置报告章节模板
const PRESET_SECTIONS: ReportSection[] = [
  { id: 's1', title: '主体资格与公司治理', moduleKey: 'corporate_status', fields: ['summary', 'findings'], enabled: true, showTable: false },
  { id: 's2', title: '主要资产与知识产权', moduleKey: 'assets_ip', fields: ['summary', 'findings'], enabled: true, showTable: false },
  { id: 's3', title: '业务合规与经营资质', moduleKey: 'business_compliance', fields: ['summary', 'findings'], enabled: true, showTable: false },
  { id: 's4', title: '债务担保与或有负债', moduleKey: 'debts_guarantees', fields: ['summary', 'findings'], enabled: true, showTable: false },
  { id: 's5', title: '人力资源与劳动关系', moduleKey: 'hr_labor', fields: ['summary', 'findings'], enabled: true, showTable: false },
  { id: 's6', title: '财税合规评价', moduleKey: 'tax_compliance', fields: ['summary', 'findings'], enabled: true, showTable: true },
  { id: 's7', title: '吸收合并方案分析', moduleKey: 'merger_decision', fields: ['recommendation', 'tax_scenarios_computed', 'weighted_scores'], enabled: true, showTable: true },
  { id: 's8', title: 'AEO 资质影响评估', moduleKey: 'aeo_valuation', fields: ['summary', 'total_value', 'value_range'], enabled: false, showTable: true },
];

// ─────────────────────────────────────────────────────────────────
// Skill 序列化：结构化步骤 → SKILL.md 文本
// ─────────────────────────────────────────────────────────────────

function serializeSkill(steps: SkillStep[], appName: string): string {
  const header = `---
name: ${appName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
version: 1.0.0
description: ${appName}
tools:
  - vector_search
  - python_executor
  - search_regulations
---

## 执行步骤
`;
  const body = steps
    .filter(s => s.enabled)
    .map((s, i) => {
      const kws = s.searchKeywords.split(/[,，]/).map(k => k.trim()).filter(Boolean);
      const points = s.analysisPoints.map(p => `- ${p}`).join('\n');
      let text = `
### Step ${i + 1}: ${s.name}

从项目知识库检索相关资料：
- query: "${kws.join(' ')}"
- limit: 10

分析要点：
${points}

输出字段：${s.outputField}
`;
      if (s.pythonScript) {
        text += `
调用 python_executor 执行 computations/${s.pythonScript}
`;
      }
      return text;
    })
    .join('\n');

  const outputFields = steps.filter(s => s.enabled).map(s => `    "${s.outputField}": {}`).join(',\n');
  const schema = `
## 输出 Schema

\`\`\`json
{
  "enterprise_name": "string",
  "report_date": "string",
  "modules": {
${outputFields}
  },
  "risk_summary": [],
  "law_citations": []
}
\`\`\`
`;
  return header + body + schema;
}

// ─────────────────────────────────────────────────────────────────
// 报告模板序列化：章节配置 → Jinja2 HTML
// ─────────────────────────────────────────────────────────────────

function serializeReport(sections: ReportSection[], appName: string): string {
  const enabledSections = sections.filter(s => s.enabled);

  const sectionHtml = enabledSections.map((s, i) => {
    const chNum = ['一', '二', '三', '四', '五', '六', '七', '八'][i] || String(i + 1);
    const mod = `modules.${s.moduleKey}`;

    if (s.showTable && s.moduleKey === 'merger_decision') {
      return `
<div class="section">
<h1>第${chNum}章　${s.title}</h1>
{% if modules.merger_decision %}
<h2>推荐方案</h2>
<div class="conclusion-box">
  <p><strong>{{ modules.merger_decision.recommendation or '待律师确认' }}</strong></p>
  {% if modules.merger_decision.recommendation_rationale %}
  <p>{{ modules.merger_decision.recommendation_rationale }}</p>
  {% endif %}
</div>
{% if modules.merger_decision.tax_scenarios_computed %}
<h2>四情景税务净收益对比</h2>
<table>
  <thead><tr><th>情景</th><th>方案</th><th>净收益（万元）</th></tr></thead>
  <tbody>
  {% for s in modules.merger_decision.tax_scenarios_computed %}
  <tr><td>{{ s.id }}</td><td>{{ s.name }}</td><td>{{ s.net_benefit }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}
{% endif %}
</div>`;
    }

    if (s.showTable) {
      return `
<div class="section">
<h1>第${chNum}章　${s.title}</h1>
{% if ${mod} %}
<p>{{ ${mod}.summary or '（待资料上传后自动分析）' }}</p>
{% if ${mod}.key_data %}
<table>
  <thead><tr><th>项目</th><th>数据</th></tr></thead>
  <tbody>
  {% for k, v in ${mod}.key_data.items() %}
  <tr><td>{{ k }}</td><td>{{ v }}</td></tr>
  {% endfor %}
  </tbody>
</table>
{% endif %}
{% endif %}
</div>`;
    }

    return `
<div class="section">
<h1>第${chNum}章　${s.title}</h1>
{% if ${mod} %}
<p>{{ ${mod}.summary or '（待资料上传后自动分析）' }}</p>
{% if ${mod}.findings %}
<ul>{% for f in ${mod}.findings %}<li>{{ f }}</li>{% endfor %}</ul>
{% endif %}
{% endif %}
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<style>
body{font-family:"SimSun","宋体",serif;font-size:12pt;line-height:1.9;color:#1a1a1a;max-width:900px;margin:0 auto;padding:30px 40px}
.cover{text-align:center;padding:60px 0 40px;border-bottom:3px double #1a3a6b;margin-bottom:50px}
.cover-title{font-size:24pt;font-weight:bold;color:#0d1f3c;margin-bottom:8px}
.cover-meta td:first-child{color:#666;padding-right:20px}
.cover-meta td:last-child{font-weight:bold;color:#0d1f3c}
h1{font-size:16pt;font-weight:bold;color:#0d1f3c;text-align:center;margin:36px 0 20px;padding-bottom:8px;border-bottom:2px solid #1a3a6b}
h2{font-size:13pt;font-weight:bold;color:#0d1f3c;margin:24px 0 12px;padding:5px 0 5px 10px;border-left:4px solid #1a3a6b;background:#f5f7fa}
p{margin:8px 0;text-indent:2em;line-height:1.9}
ul{margin:8px 0 8px 2.5em}li{margin:4px 0}
table{width:100%;border-collapse:collapse;margin:12px 0}
thead tr th{background:#1a3a6b;color:#fff;padding:7px 10px;text-align:center;border:1px solid #1a3a6b}
tbody tr td{padding:6px 10px;border:1px solid #c8d0dc}
tbody tr:nth-child(even) td{background:#f5f7fa}
.conclusion-box{border:2px solid #1a3a6b;background:#eef2ff;padding:14px 18px;margin:14px 0}
.section{margin-top:40px}
.risk-item{border:1px solid #dde3ec;padding:12px 16px;margin:10px 0;background:#fafbfd}
.disclaimer{font-size:9.5pt;color:#666;border-top:1px solid #ccc;margin-top:36px;padding-top:12px}
</style></head><body>

<div class="cover">
  <div class="cover-title">{{ enterprise_name }}</div>
  <div style="font-size:14pt;color:#1a3a6b;margin-bottom:30px">${appName}</div>
  <table class="cover-meta" style="margin:0 auto;font-size:11pt;line-height:2.8">
    <tr><td>报告日期</td><td>{{ report_date }}</td></tr>
    <tr><td>报告编号</td><td>{{ report_id }}</td></tr>
    <tr><td>编制单位</td><td>{{ law_firm or 'ClawComply 合规平台' }}</td></tr>
  </table>
</div>

{% if risk_summary %}
<div class="section">
<h1>核心风险发现</h1>
{% for r in risk_summary %}
<div class="risk-item">
  <strong>{{ r.title }}</strong>
  <p>{{ r.description }}</p>
  {% if r.law_citation %}<p style="color:#555;font-style:italic">法规依据：{{ r.law_citation }}</p>{% endif %}
  {% if r.recommendation %}<p style="color:#1a3a6b">建议：{{ r.recommendation }}</p>{% endif %}
</div>
{% endfor %}
</div>
{% endif %}
${sectionHtml}

{% if law_citations %}
<div class="section">
<h1>法规引用附录</h1>
{% for c in law_citations %}
<div style="font-size:10pt;color:#444;background:#f5f7fa;border-left:3px solid #1a3a6b;padding:5px 12px;margin:5px 0">
  <strong>《{{ c.law_name }}》{{ c.article }}</strong>：{{ c.text }}
</div>
{% endfor %}
</div>
{% endif %}

<div class="disclaimer">
  <p>⚖️ 本报告由 AI 辅助生成，经律师审核确认。报告内容仅供参考，不构成正式法律意见。</p>
  <p>报告编号：{{ report_id }} | 生成时间：{{ report_date }}</p>
</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────
// 反序列化：SKILL.md 文本 → 结构化步骤（尽力解析）
// ─────────────────────────────────────────────────────────────────

function parseSkillSteps(skillMd: string): SkillStep[] {
  const steps: SkillStep[] = [];
  const stepBlocks = skillMd.split(/###\s+Step\s+\d+[：:]/);
  stepBlocks.slice(1).forEach((block, i) => {
    const lines = block.split('\n');
    const name = lines[0]?.trim() || `步骤${i + 1}`;
    const queryMatch = block.match(/query[：:]\s*"([^"]+)"/);
    const keywords = queryMatch ? queryMatch[1] : '';
    const outputMatch = block.match(/输出字段[：:]\s*(\S+)/);
    const outputField = outputMatch ? outputMatch[1] : `module_${i + 1}`;
    const scriptMatch = block.match(/computations\/(\S+\.py)/);
    const points: string[] = [];
    const pointLines = block.match(/^[-•]\s+(.+)$/gm) || [];
    pointLines.forEach(l => points.push(l.replace(/^[-•]\s+/, '').trim()));
    steps.push({
      id: `step${Date.now()}_${i}`,
      name, searchKeywords: keywords,
      analysisPoints: points.slice(0, 6),
      outputField, pythonScript: scriptMatch?.[1],
      enabled: true,
    });
  });
  return steps.length > 0 ? steps : [];
}

// ─────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────

const AppEditPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const appId = Number(id);

  const [app, setApp] = useState<AppDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('info');
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [info, setInfo] = useState({ name: '', version: '', description: '', category: '', author: '' });
  const [checklist, setChecklist] = useState<ChecklistDef>({ phases: [] });
  const [skillSteps, setSkillSteps] = useState<SkillStep[]>([]);
  const [skillRawMode, setSkillRawMode] = useState(false);
  const [skillRaw, setSkillRaw] = useState('');
  const [reportSections, setReportSections] = useState<ReportSection[]>(PRESET_SECTIONS);
  const [reportRawMode, setReportRawMode] = useState(false);
  const [reportRaw, setReportRaw] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await window.electronAPI.apiRequest('GET', `/api/apps/id/${appId}`);
    if (res.success && res.data) {
      const d: AppDetail = res.data;
      setApp(d);
      setInfo({ name: d.name || '', version: d.version || '', description: d.description || '', category: d.category || '', author: d.author || '' });
      setChecklist(d.checklist || { phases: [] });
      const raw = d.skillDef || '';
      setSkillRaw(raw);
      const parsed = parseSkillSteps(raw);
      setSkillSteps(parsed.length > 0 ? parsed : getDefaultSteps(d.slug || ''));
      setReportRaw(d.reportTmpl || '');
    }
    setLoading(false);
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, any>) => {
    setSaving(true); setSaveMsg(null);
    const res = await window.electronAPI.apiRequest('PUT', `/api/apps/${appId}`, patch);
    setSaving(false);
    if (res.success) { setSaveMsg({ type: 'ok', text: '保存成功' }); setTimeout(() => setSaveMsg(null), 2500); if (res.data) setApp(res.data); }
    else setSaveMsg({ type: 'err', text: res.error || '保存失败' });
  };

  const handleSaveSkill = () => {
    const skillDef = skillRawMode ? skillRaw : serializeSkill(skillSteps, info.name || app?.name || '');
    save({ skillDef });
  };

  const handleSaveReport = () => {
    const reportTmpl = reportRawMode ? reportRaw : serializeReport(reportSections, info.name || app?.name || '');
    save({ reportTmpl });
  };

  const handleGenerateReport = () => {
    const tmpl = serializeReport(reportSections, info.name || app?.name || '');
    setReportRaw(tmpl);
    save({ reportTmpl: tmpl });
  };

  const currentSaveHandler = {
    info: () => save(info),
    checklist: () => save({ checklist }),
    skill: handleSaveSkill,
    report: handleSaveReport,
    lessons: undefined,  // lessons tab 不需要保存按钮
  }[tab];

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!app) return <div className="flex-1 flex flex-col items-center justify-center gap-3"><AlertCircle className="w-10 h-10 text-red-400" /><p className="text-red-400">智能体不存在</p><button onClick={() => navigate('/apps')} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm">返回</button></div>;

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/apps')} className="text-slate-400 hover:text-slate-200 transition-colors"><ArrowLeft className="w-4 h-4" /></button>
          <div><h2 className="text-sm font-semibold text-slate-200">{app.name}</h2><p className="text-xs text-slate-500">智能体配置 · v{app.version}</p></div>
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && <span className={`flex items-center gap-1.5 text-xs ${saveMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{saveMsg.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}{saveMsg.text}</span>}
          {currentSaveHandler && (
            <button onClick={currentSaveHandler} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}保存
            </button>
          )}
        </div>
      </header>

      <div className="flex border-b border-slate-800 flex-shrink-0 px-5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === key ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'info'      && <div className="flex-1 overflow-y-auto"><InfoTab info={info} onChange={setInfo} /></div>}
        {tab === 'checklist' && <div className="flex-1 overflow-y-auto"><ChecklistEditorTab checklist={checklist} onChange={setChecklist} /></div>}
        {tab === 'skill'     && <SkillEditorTab steps={skillSteps} onStepsChange={setSkillSteps} rawMode={skillRawMode} onRawModeChange={setSkillRawMode} rawValue={skillRaw} onRawChange={setSkillRaw} appName={info.name || app.name} />}
        {tab === 'report'    && <ReportEditorTab sections={reportSections} onSectionsChange={setReportSections} rawMode={reportRawMode} onRawModeChange={setReportRawMode} rawValue={reportRaw} onRawChange={setReportRaw} appName={info.name || app.name} onGenerate={handleGenerateReport} />}
        {tab === 'lessons'   && <AgentLessonsPanel agentId={appId} />}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 默认步骤（根据应用类型预填）
// ─────────────────────────────────────────────────────────────────

function getDefaultSteps(slug: string): SkillStep[] {
  if (slug.includes('fdi') || slug.includes('due-diligence')) {
    return [
      { id: 's1', name: '主体资格分析', searchKeywords: '营业执照 公司章程 股权结构 董事会', analysisPoints: ['设立与存续合法性', '股东与股权结构', '公司治理'], outputField: 'corporate_status', enabled: true },
      { id: 's2', name: '资产权属分析', searchKeywords: '不动产权证 固定资产 知识产权 商标 专利', analysisPoints: ['土地及不动产', '核心生产设备', '知识产权'], outputField: 'assets_ip', enabled: true },
      { id: 's3', name: '业务合规分析', searchKeywords: '生产许可证 AEO认证 经营资质 业务模式', analysisPoints: ['业务模式', '经营资质', '重大合同'], outputField: 'business_compliance', enabled: true },
      { id: 's4', name: '债务担保分析', searchKeywords: '应付账款 银行借款 担保 诉讼 仲裁', analysisPoints: ['应付账款', '银行借款', '未决诉讼'], outputField: 'debts_guarantees', enabled: true },
      { id: 's5', name: '人力资源分析', searchKeywords: '员工花名册 劳动合同 社保 薪酬', analysisPoints: ['人员规模', '劳动合同', '社保公积金'], outputField: 'hr_labor', enabled: true },
      { id: 's6', name: '财税合规分析', searchKeywords: '审计报告 纳税申报表 税收优惠 转移定价', analysisPoints: ['财务核算', '税务合规', '税收优惠'], outputField: 'tax_compliance', enabled: true },
      { id: 's7', name: '合并方案评估', searchKeywords: '合并方案 税务处理 资质转移', analysisPoints: ['税务情景对比', '资质转移分析', '多维度评分', '综合建议'], outputField: 'merger_decision', pythonScript: 'tax_scenarios.py', enabled: true },
    ];
  }
  if (slug.includes('trade-secret')) {
    return [
      { id: 's1', name: '秘点识别', searchKeywords: '技术信息 工艺 配方 客户名单 营销策略', analysisPoints: ['秘点识别', '反向工程难度'], outputField: 'secret_points', enabled: true },
      { id: 's2', name: '价值量化', searchKeywords: '研发费用 财务报表 产品溢价', analysisPoints: ['价值量化'], outputField: 'value_assessment', pythonScript: 'value_assessment.py', enabled: true },
      { id: 's3', name: '保密措施评估', searchKeywords: '保密协议 竞业限制 保密制度 门禁', analysisPoints: ['保密措施', '风险诊断'], outputField: 'protection_score', enabled: true },
    ];
  }
  return [{ id: 's1', name: '合规分析', searchKeywords: '', analysisPoints: [], outputField: 'analysis', enabled: true }];
}

// ─────────────────────────────────────────────────────────────────
// Skill 编辑 Tab
// ─────────────────────────────────────────────────────────────────

const SkillEditorTab: React.FC<{
  steps: SkillStep[]; onStepsChange: (s: SkillStep[]) => void;
  rawMode: boolean; onRawModeChange: (v: boolean) => void;
  rawValue: string; onRawChange: (v: string) => void;
  appName: string;
}> = ({ steps, onStepsChange, rawMode, onRawModeChange, rawValue, onRawChange, appName }) => {
  const [preview, setPreview] = useState(false);
  const generated = serializeSkill(steps, appName);

  const addStep = () => {
    const id = `step${Date.now()}`;
    onStepsChange([...steps, { id, name: '新分析步骤', searchKeywords: '', analysisPoints: [], outputField: `module_${steps.length + 1}`, enabled: true }]);
  };

  const updateStep = (idx: number, patch: Partial<SkillStep>) => {
    onStepsChange(steps.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const removeStep = (idx: number) => onStepsChange(steps.filter((_, i) => i !== idx));

  const moveStep = (idx: number, dir: -1 | 1) => {
    const arr = [...steps];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onStepsChange(arr);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-400" />
          <span className="text-xs text-slate-400">结构化步骤配置，系统自动生成 Skill 定义</span>
        </div>
        <div className="flex items-center gap-2">
          {!rawMode && (
            <button onClick={() => setPreview(!preview)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${preview ? 'bg-brand-600/20 text-brand-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
              {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {preview ? '隐藏预览' : '预览 SKILL.md'}
            </button>
          )}
          <button onClick={() => { if (!rawMode) onRawChange(generated); onRawModeChange(!rawMode); }} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${rawMode ? 'bg-amber-600/20 text-amber-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
            <Code2 className="w-3.5 h-3.5" />
            {rawMode ? '返回可视化' : '高级模式'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：步骤编辑 或 原始编辑 */}
        <div className={`flex flex-col overflow-y-auto ${preview && !rawMode ? 'w-1/2 border-r border-slate-800' : 'flex-1'}`}>
          {rawMode ? (
            <div className="flex-1 flex flex-col p-4 gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                高级模式：直接编辑 SKILL.md 原始内容，适合技术人员深度定制
              </div>
              <textarea value={rawValue} onChange={e => onRawChange(e.target.value)} spellCheck={false}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-mono focus:outline-none focus:border-brand-500 resize-none leading-relaxed"
                style={{ minHeight: '500px' }} />
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500">{steps.filter(s => s.enabled).length} 个启用步骤</p>
                <button onClick={addStep} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" />添加步骤
                </button>
              </div>
              {steps.map((step, idx) => (
                <SkillStepCard key={step.id} step={step} index={idx} total={steps.length}
                  onChange={patch => updateStep(idx, patch)}
                  onRemove={() => removeStep(idx)}
                  onMove={dir => moveStep(idx, dir)} />
              ))}
              {steps.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                  <Code2 className="w-10 h-10 mx-auto mb-2 text-slate-700" />
                  <p className="text-sm">暂无分析步骤，点击「添加步骤」开始配置</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 右侧：SKILL.md 预览 */}
        {preview && !rawMode && (
          <div className="w-1/2 flex flex-col">
            <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono">SKILL.md 预览</span>
              <span className="text-xs text-emerald-500/70">· 自动生成</span>
            </div>
            <pre className="flex-1 overflow-auto px-4 py-3 text-xs text-slate-300 font-mono leading-relaxed bg-slate-950 whitespace-pre-wrap">{generated}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 单个 Skill 步骤卡片
// ─────────────────────────────────────────────────────────────────

const PYTHON_SCRIPTS = [
  { value: '', label: '无（纯 AI 分析）' },
  { value: 'tax_scenarios.py', label: 'tax_scenarios.py — 四情景税务计算' },
  { value: 'aeo_valuation.py', label: 'aeo_valuation.py — AEO 价值量化' },
  { value: 'merger_scoring.py', label: 'merger_scoring.py — 多维度加权评分' },
  { value: 'value_assessment.py', label: 'value_assessment.py — 商业秘密价值评估' },
];

const SkillStepCard: React.FC<{
  step: SkillStep; index: number; total: number;
  onChange: (p: Partial<SkillStep>) => void;
  onRemove: () => void; onMove: (d: -1 | 1) => void;
}> = ({ step, index, total, onChange, onRemove, onMove }) => {
  const [expanded, setExpanded] = useState(index === 0);
  const allPoints = Object.values(ANALYSIS_POINT_OPTIONS).flat();

  return (
    <div className={`border rounded-xl overflow-hidden transition-colors ${step.enabled ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}>
      {/* 步骤头 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80">
        <GripVertical className="w-4 h-4 text-slate-600 flex-shrink-0" />
        <span className="text-xs text-slate-500 flex-shrink-0 w-5">#{index + 1}</span>
        <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-slate-300 flex-shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <input value={step.name} onChange={e => onChange({ name: e.target.value })}
          className="flex-1 bg-transparent text-sm font-medium text-slate-200 focus:outline-none min-w-0" placeholder="步骤名称" />
        <span className="text-xs text-slate-600 font-mono flex-shrink-0">{step.outputField}</span>
        <button onClick={() => onChange({ enabled: !step.enabled })} className="flex-shrink-0" title={step.enabled ? '点击禁用' : '点击启用'}>
          {step.enabled ? <ToggleRight className="w-5 h-5 text-brand-400" /> : <ToggleLeft className="w-5 h-5 text-slate-600" />}
        </button>
        <div className="flex gap-0.5 flex-shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-30"><ChevronDown className="w-3 h-3 rotate-180" /></button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
          <button onClick={onRemove} className="p-1 rounded text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>

      {/* 步骤详情 */}
      {expanded && (
        <div className="px-4 py-3 space-y-3 bg-slate-900/30">
          {/* 检索关键词 */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">检索关键词 <span className="text-slate-600">（用于从项目知识库检索相关资料）</span></label>
            <input value={step.searchKeywords} onChange={e => onChange({ searchKeywords: e.target.value })}
              placeholder="如：营业执照 公司章程 股权结构（空格分隔）"
              className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/50 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-brand-500" />
          </div>

          {/* 分析要点 */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">分析要点 <span className="text-slate-600">（点击选择，AI 将重点分析这些方面）</span></label>
            <div className="flex flex-wrap gap-1.5">
              {allPoints.map(pt => {
                const active = step.analysisPoints.includes(pt);
                return (
                  <button key={pt} onClick={() => onChange({ analysisPoints: active ? step.analysisPoints.filter(p => p !== pt) : [...step.analysisPoints, pt] })}
                    className={`px-2.5 py-1 rounded-full text-xs transition-colors ${active ? 'bg-brand-600/30 text-brand-300 border border-brand-600/50' : 'bg-slate-800 text-slate-400 border border-slate-700/50 hover:border-slate-600'}`}>
                    {pt}
                  </button>
                );
              })}
            </div>
            {step.analysisPoints.length > 0 && (
              <p className="text-xs text-slate-600 mt-1">已选：{step.analysisPoints.join('、')}</p>
            )}
          </div>

          {/* 输出字段 + Python 脚本 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">输出字段名 <span className="text-slate-600">（对应报告章节）</span></label>
              <input value={step.outputField} onChange={e => onChange({ outputField: e.target.value })}
                placeholder="如：corporate_status"
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/50 text-sm text-slate-200 font-mono placeholder:text-slate-600 focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Python 计算脚本 <span className="text-slate-600">（可选）</span></label>
              <select value={step.pythonScript || ''} onChange={e => onChange({ pythonScript: e.target.value || undefined })}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/50 text-sm text-slate-200 focus:outline-none focus:border-brand-500">
                {PYTHON_SCRIPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 报告模板编辑 Tab
// ─────────────────────────────────────────────────────────────────

const ReportEditorTab: React.FC<{
  sections: ReportSection[]; onSectionsChange: (s: ReportSection[]) => void;
  rawMode: boolean; onRawModeChange: (v: boolean) => void;
  rawValue: string; onRawChange: (v: string) => void;
  appName: string; onGenerate: () => void;
}> = ({ sections, onSectionsChange, rawMode, onRawModeChange, rawValue, onRawChange, appName, onGenerate }) => {
  const [preview, setPreview] = useState(false);
  const generated = serializeReport(sections, appName);

  const updateSection = (idx: number, patch: Partial<ReportSection>) => {
    onSectionsChange(sections.map((s, i) => i === idx ? { ...s, ...patch } : s));
  };

  const addSection = () => {
    const id = `sec${Date.now()}`;
    onSectionsChange([...sections, { id, title: '新章节', moduleKey: '', fields: ['summary', 'findings'], enabled: true, showTable: false }]);
  };

  const removeSection = (idx: number) => onSectionsChange(sections.filter((_, i) => i !== idx));

  const moveSection = (idx: number, dir: -1 | 1) => {
    const arr = [...sections];
    const t = idx + dir;
    if (t < 0 || t >= arr.length) return;
    [arr[idx], arr[t]] = [arr[t], arr[idx]];
    onSectionsChange(arr);
  };

  const previewHtml = (() => {
    const tmpl = rawMode ? rawValue : generated;
    if (!tmpl.trim()) return '<div style="padding:40px;color:#94a3b8;text-align:center">暂无内容</div>';
    let html = tmpl
      .replace(/\{%-?\s*for\s+\w+\s+in\s+[^%]+%\}([\s\S]*?)\{%-?\s*endfor\s*-?%\}/g, (_, b) => b.replace(/\{\{[^}]+\}\}/g, '<em style="color:#94a3b8">示例值</em>'))
      .replace(/\{%-?\s*if\s[^%]*%\}/g, '').replace(/\{%-?\s*elif\s[^%]*%\}/g, '')
      .replace(/\{%-?\s*else\s*-?%\}/g, '').replace(/\{%-?\s*endif\s*-?%\}/g, '')
      .replace(/\{%[^%]*%\}/g, '')
      .replace(/\{\{\s*([\w.]+)(?:\s*\|[^}]*)?\s*\}\}/g, (_, k) => {
        const samples: Record<string, string> = { enterprise_name: '某某（广州）有限公司', report_date: new Date().toLocaleDateString('zh-CN'), report_id: 'RPT-DEMO-001', law_firm: 'ClawComply 合规平台', summary: '经综合分析，该企业合规状况良好。', recommendation: '建议采用情景三方案' };
        const key = k.split('.').pop() || k;
        return samples[key] || `<span style="background:#1e3a5f;color:#60a5fa;padding:1px 5px;border-radius:3px;font-size:0.82em;font-family:monospace">{{ ${k} }}</span>`;
      })
      .replace(/\{\{[^}]+\}\}/g, '<span style="background:#1e3a5f;color:#60a5fa;padding:1px 5px;border-radius:3px;font-size:0.82em">示例值</span>');
    return html;
  })();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-400" />
          <span className="text-xs text-slate-400">勾选章节、填写标题，系统自动生成报告模板</span>
        </div>
        <div className="flex items-center gap-2">
          {!rawMode && (
            <>
              <button onClick={() => setPreview(!preview)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${preview ? 'bg-brand-600/20 text-brand-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {preview ? '隐藏预览' : '预览报告'}
              </button>
              <button onClick={onGenerate} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-emerald-700/20 text-emerald-300 hover:bg-emerald-700/30 transition-colors">
                <Wand2 className="w-3.5 h-3.5" />生成并保存
              </button>
            </>
          )}
          <button onClick={() => { if (!rawMode) onRawChange(generated); onRawModeChange(!rawMode); }} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors ${rawMode ? 'bg-amber-600/20 text-amber-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
            <Code2 className="w-3.5 h-3.5" />{rawMode ? '返回可视化' : '高级模式'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：章节配置 或 原始编辑 */}
        <div className={`flex flex-col overflow-y-auto ${preview ? 'w-1/2 border-r border-slate-800' : 'flex-1'}`}>
          {rawMode ? (
            <div className="flex-1 flex flex-col p-4 gap-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                高级模式：直接编辑 Jinja2 HTML 模板，适合技术人员深度定制
              </div>
              <textarea value={rawValue} onChange={e => onRawChange(e.target.value)} spellCheck={false}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-sm font-mono focus:outline-none focus:border-brand-500 resize-none leading-relaxed"
                style={{ minHeight: '500px' }} />
            </div>
          ) : (
            <div className="p-5 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-500">{sections.filter(s => s.enabled).length} 个启用章节</p>
                <button onClick={addSection} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" />添加章节
                </button>
              </div>
              {sections.map((sec, idx) => (
                <ReportSectionCard key={sec.id} section={sec} index={idx} total={sections.length}
                  onChange={patch => updateSection(idx, patch)}
                  onRemove={() => removeSection(idx)}
                  onMove={dir => moveSection(idx, dir)} />
              ))}
            </div>
          )}
        </div>

        {/* 右侧：报告预览 */}
        {preview && (
          <div className="w-1/2 flex flex-col">
            <div className="px-3 py-1.5 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2">
              <span className="text-xs text-slate-500">报告预览（示例数据）</span>
              <span className="text-xs text-amber-500/70">· 变量已替换为演示值</span>
            </div>
            <div className="flex-1 bg-white overflow-hidden">
              <iframe srcDoc={previewHtml} className="w-full h-full border-0" sandbox="allow-same-origin" title="报告预览" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// 单个报告章节卡片
// ─────────────────────────────────────────────────────────────────

const MODULE_KEY_OPTIONS = [
  { value: 'corporate_status', label: '主体资格（corporate_status）' },
  { value: 'assets_ip', label: '资产权属（assets_ip）' },
  { value: 'business_compliance', label: '业务合规（business_compliance）' },
  { value: 'debts_guarantees', label: '债务担保（debts_guarantees）' },
  { value: 'hr_labor', label: '人力资源（hr_labor）' },
  { value: 'tax_compliance', label: '财税合规（tax_compliance）' },
  { value: 'merger_decision', label: '合并方案（merger_decision）' },
  { value: 'aeo_valuation', label: 'AEO 评估（aeo_valuation）' },
  { value: 'secret_points', label: '秘点识别（secret_points）' },
  { value: 'value_assessment', label: '价值评估（value_assessment）' },
  { value: 'protection_score', label: '保密措施（protection_score）' },
];

const ReportSectionCard: React.FC<{
  section: ReportSection; index: number; total: number;
  onChange: (p: Partial<ReportSection>) => void;
  onRemove: () => void; onMove: (d: -1 | 1) => void;
}> = ({ section, index, total, onChange, onRemove, onMove }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${section.enabled ? 'border-slate-700 bg-slate-900/50' : 'border-slate-800 bg-slate-900/20 opacity-60'}`}>
    <GripVertical className="w-4 h-4 text-slate-600 flex-shrink-0" />
    <span className="text-xs text-slate-500 flex-shrink-0 w-5">#{index + 1}</span>

    {/* 章节标题 */}
    <input value={section.title} onChange={e => onChange({ title: e.target.value })}
      className="w-36 bg-transparent text-sm text-slate-200 focus:outline-none border-b border-slate-700 focus:border-brand-500 pb-0.5"
      placeholder="章节标题" />

    {/* 对应模块 */}
    <select value={section.moduleKey} onChange={e => onChange({ moduleKey: e.target.value })}
      className="flex-1 px-2 py-1 rounded bg-slate-800 border border-slate-700/50 text-xs text-slate-300 focus:outline-none focus:border-brand-500">
      <option value="">选择对应模块...</option>
      {MODULE_KEY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>

    {/* 表格展示 */}
    <button onClick={() => onChange({ showTable: !section.showTable })} title={section.showTable ? '当前：表格展示' : '当前：列表展示'}
      className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors flex-shrink-0 ${section.showTable ? 'bg-blue-900/30 text-blue-300' : 'bg-slate-800 text-slate-500'}`}>
      {section.showTable ? '表格' : '列表'}
    </button>

    {/* 启用/禁用 */}
    <button onClick={() => onChange({ enabled: !section.enabled })} className="flex-shrink-0">
      {section.enabled ? <ToggleRight className="w-5 h-5 text-brand-400" /> : <ToggleLeft className="w-5 h-5 text-slate-600" />}
    </button>

    {/* 排序 + 删除 */}
    <div className="flex gap-0.5 flex-shrink-0">
      <button onClick={() => onMove(-1)} disabled={index === 0} className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-30"><ChevronDown className="w-3 h-3 rotate-180" /></button>
      <button onClick={() => onMove(1)} disabled={index === total - 1} className="p-1 rounded text-slate-600 hover:text-slate-300 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
      <button onClick={onRemove} className="p-1 rounded text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────
// 基本信息 Tab（保持原有）
// ─────────────────────────────────────────────────────────────────

const InfoTab: React.FC<{
  info: { name: string; version: string; description: string; category: string; author: string };
  onChange: (v: any) => void;
}> = ({ info, onChange }) => {
  const field = (label: string, key: string, placeholder?: string, multiline?: boolean) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
      {multiline ? (
        <textarea value={(info as any)[key]} onChange={e => onChange({ ...info, [key]: e.target.value })} placeholder={placeholder} rows={4}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-500 resize-none" />
      ) : (
        <input value={(info as any)[key]} onChange={e => onChange({ ...info, [key]: e.target.value })} placeholder={placeholder}
          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none focus:border-brand-500" />
      )}
    </div>
  );
  return (
    <div className="p-6 max-w-2xl space-y-4">
      {field('智能体名称', 'name', '如：外商投资企业·法律尽职调查智能体')}
      <div className="grid grid-cols-2 gap-4">
        {field('版本号', 'version', '如：1.0.0')}
        {field('分类', 'category', '如：M&A、知识产权合规')}
      </div>
      {field('作者', 'author', '如：主理律师')}
      {field('描述', 'description', '简要描述应用的适用场景和功能', true)}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Checklist 编辑 Tab（保持原有）
// ─────────────────────────────────────────────────────────────────

const ChecklistEditorTab: React.FC<{ checklist: ChecklistDef; onChange: (v: ChecklistDef) => void }> = ({ checklist, onChange }) => {
  const phases = checklist.phases || [];
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set(phases.map(p => p.id)));
  const togglePhase = (id: string) => setExpandedPhases(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const updatePhase = (idx: number, patch: Partial<Phase>) => onChange({ ...checklist, phases: phases.map((p, i) => i === idx ? { ...p, ...patch } : p) });
  const addPhase = () => { const id = `phase${Date.now()}`; onChange({ ...checklist, phases: [...phases, { id, name: '新阶段', items: [] }] }); setExpandedPhases(prev => new Set(prev).add(id)); };
  const removePhase = (idx: number) => onChange({ ...checklist, phases: phases.filter((_, i) => i !== idx) });
  const updateItem = (pi: number, ii: number, patch: Partial<ChecklistItem>) => onChange({ ...checklist, phases: phases.map((p, pIdx) => pIdx !== pi ? p : { ...p, items: p.items.map((it, iIdx) => iIdx !== ii ? it : { ...it, ...patch }) }) });
  const addItem = (pi: number) => { const id = `item${Date.now()}`; onChange({ ...checklist, phases: phases.map((p, pIdx) => pIdx !== pi ? p : { ...p, items: [...p.items, { id, name: '新资料项', required: true }] }) }); };
  const removeItem = (pi: number, ii: number) => onChange({ ...checklist, phases: phases.map((p, pIdx) => pIdx !== pi ? p : { ...p, items: p.items.filter((_, iIdx) => iIdx !== ii) }) });
  const totalItems = phases.reduce((s, p) => s + p.items.length, 0);

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-slate-500">共 {phases.length} 个阶段，{totalItems} 项资料</p>
        <button onClick={addPhase} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors"><Plus className="w-3.5 h-3.5" />新增阶段</button>
      </div>
      <div className="space-y-3">
        {phases.map((phase, pi) => (
          <div key={phase.id} className="border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/80">
              <button onClick={() => togglePhase(phase.id)} className="text-slate-500 hover:text-slate-300">{expandedPhases.has(phase.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
              <input value={phase.name} onChange={e => updatePhase(pi, { name: e.target.value })} className="flex-1 bg-transparent text-sm font-medium text-slate-200 focus:outline-none" placeholder="阶段名称" />
              <span className="text-xs text-slate-600">{phase.items.length} 项</span>
              <button onClick={() => addItem(pi)} className="p-1 rounded text-slate-500 hover:text-brand-400 hover:bg-slate-800 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
              <button onClick={() => removePhase(pi)} className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {expandedPhases.has(phase.id) && (
              <div className="divide-y divide-slate-800/50">
                {phase.items.length === 0 && <div className="px-4 py-3 text-xs text-slate-600 text-center">暂无资料项，点击 + 添加</div>}
                {phase.items.map((item, ii) => <ChecklistItemRow key={item.id} item={item} onChange={patch => updateItem(pi, ii, patch)} onRemove={() => removeItem(pi, ii)} />)}
              </div>
            )}
          </div>
        ))}
        {phases.length === 0 && <div className="text-center py-12 text-slate-500"><ClipboardList className="w-10 h-10 mx-auto mb-2 text-slate-700" /><p className="text-sm">暂无阶段，点击「新增阶段」开始构建 Checklist</p></div>}
      </div>
    </div>
  );
};

const ChecklistItemRow: React.FC<{ item: ChecklistItem; onChange: (p: Partial<ChecklistItem>) => void; onRemove: () => void }> = ({ item, onChange, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-4 py-2.5 bg-slate-900/30">
      <div className="flex items-center gap-2">
        <button onClick={() => setExpanded(!expanded)} className="text-slate-600 hover:text-slate-400 flex-shrink-0">{expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</button>
        <button onClick={() => onChange({ required: !item.required })} className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded ${item.required !== false ? 'bg-red-900/30 text-red-400' : 'bg-slate-800 text-slate-500'}`}>{item.required !== false ? '必填' : '选填'}</button>
        <input value={item.name} onChange={e => onChange({ name: e.target.value })} className="flex-1 bg-transparent text-sm text-slate-200 focus:outline-none min-w-0" placeholder="资料名称" />
        <button onClick={onRemove} className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-slate-800 transition-colors flex-shrink-0"><Trash2 className="w-3 h-3" /></button>
      </div>
      {expanded && (
        <div className="mt-2 ml-6 space-y-2">
          <div><label className="text-xs text-slate-500 mb-1 block">内容要求</label><input value={item.content_requirement || ''} onChange={e => onChange({ content_requirement: e.target.value })} placeholder="描述该资料需要包含的具体内容" className="w-full px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700/50 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-slate-500 mb-1 block">格式要求</label><input value={item.format || ''} onChange={e => onChange({ format: e.target.value })} placeholder="如：PDF/扫描件" className="w-full px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700/50 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500" /></div>
            <div><label className="text-xs text-slate-500 mb-1 block">归类关键词（逗号分隔）</label><input value={(item.match_keywords || []).join(', ')} onChange={e => onChange({ match_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="如：营业执照, 公司章程" className="w-full px-2.5 py-1.5 rounded bg-slate-800 border border-slate-700/50 text-xs text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-brand-500" /></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppEditPage;
