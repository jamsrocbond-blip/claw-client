import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Wand2, RefreshCw, AlertCircle,
  CheckCircle2, Plus, Trash2, ToggleLeft, ToggleRight,
  Sparkles, ClipboardList, BarChart3, FileText, Share2,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// 类型
// ─────────────────────────────────────────────────────────────────

interface ChecklistItemPreview { name: string; required: boolean; phase: string; }
interface AnalysisDimensionPreview { name: string; outputField: string; }
interface AiGenerateResponse {
  appName: string; category: string; description: string;
  checklist: any; skillDef: string; reportTmpl: string;
  checklistItems: ChecklistItemPreview[];
  dimensions: AnalysisDimensionPreview[];
}

const CATEGORIES = ['M&A', '知识产权合规', '数据合规', '劳动合规', '税务合规', '合同合规', '环保合规', '其他合规'];
const CATEGORY_ICON: Record<string, string> = {
  'M&A': '🏢', '知识产权合规': '🔐', '数据合规': '🛡️', '劳动合规': '👥',
  '税务合规': '💰', '合同合规': '📝', '环保合规': '🌿', '其他合规': '⚖️',
};

// ─────────────────────────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────────────────────────

const AppCreateWizard: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1：基本信息
  const [appName, setAppName] = useState('');
  const [category, setCategory] = useState('');
  const [scenario, setScenario] = useState('');
  const [materialsText, setMaterialsText] = useState('');
  const [goalsText, setGoalsText] = useState('');

  // Step 2：AI 生成预览
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [preview, setPreview] = useState<AiGenerateResponse | null>(null);
  const [editableItems, setEditableItems] = useState<ChecklistItemPreview[]>([]);
  const [editableDims, setEditableDims] = useState<AnalysisDimensionPreview[]>([]);

  // Step 3：保存
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // ── Step 1 → Step 2：调 AI 生成 ──
  const handleGenerate = async () => {
    if (!appName.trim() || !category || !scenario.trim()) return;
    setGenerating(true);
    setGenError('');

    const materials = materialsText.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
    const goals = goalsText.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);

    const res = await window.electronAPI.apiRequest('POST', '/api/apps/ai-generate', {
      appName: appName.trim(),
      category,
      scenario: scenario.trim(),
      materials,
      reportGoals: goals,
    });

    setGenerating(false);
    if (res.success && res.data) {
      const data: AiGenerateResponse = res.data;
      setPreview(data);
      setEditableItems(data.checklistItems || []);
      setEditableDims(data.dimensions || []);
      setStep(2);
    } else {
      setGenError(res.error || 'AI 生成失败，请重试');
    }
  };

  // ── Step 2 → Step 3：保存 ──
  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    setSaveError('');

    // 用编辑后的 items/dims 重建 preview
    const updatedPreview = {
      ...preview,
      checklistItems: editableItems,
      dimensions: editableDims,
    };

    const materials = materialsText.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
    const goals = goalsText.split(/[,，\n]/).map(s => s.trim()).filter(Boolean);

    const res = await window.electronAPI.apiRequest('POST', '/api/apps/ai-save', {
      generateRequest: {
        appName: appName.trim(),
        category,
        scenario: scenario.trim(),
        materials,
        reportGoals: goals,
      },
      preview: updatedPreview,
    });

    setSaving(false);
    if (res.success && res.data?.id) {
      navigate(`/apps/${res.data.id}/edit`);
    } else {
      setSaveError(res.error || '保存失败，请重试');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 顶部导航 */}
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => step === 1 ? navigate('/apps') : setStep(step === 2 ? 1 : 2)}
            className="text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">创建合规智能体</h2>
            <p className="text-xs text-slate-500">
              {step === 1 ? '描述你的业务场景，AI 帮你构建专属智能体' : step === 2 ? '确认智能体配置' : '完成'}
            </p>
          </div>
        </div>
        {/* 步骤指示器 */}
        <div className="flex items-center gap-2">
          {[1, 2].map(s => (
            <React.Fragment key={s}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                step >= s ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-500'
              }`}>{s}</div>
              {s < 2 && <div className={`w-8 h-0.5 transition-colors ${step > s ? 'bg-brand-600' : 'bg-slate-700'}`} />}
            </React.Fragment>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {step === 1 && (
          <Step1
            appName={appName} setAppName={setAppName}
            category={category} setCategory={setCategory}
            scenario={scenario} setScenario={setScenario}
            materialsText={materialsText} setMaterialsText={setMaterialsText}
            goalsText={goalsText} setGoalsText={setGoalsText}
            generating={generating} genError={genError}
            onGenerate={handleGenerate}
          />
        )}
        {step === 2 && preview && (
          <Step2
            preview={preview}
            editableItems={editableItems} setEditableItems={setEditableItems}
            editableDims={editableDims} setEditableDims={setEditableDims}
            saving={saving} saveError={saveError}
            onBack={() => setStep(1)}
            onSave={handleSave}
            onRegenerate={handleGenerate}
            generating={generating}
          />
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Step 1：描述业务场景
// ─────────────────────────────────────────────────────────────────

const Step1: React.FC<{
  appName: string; setAppName: (v: string) => void;
  category: string; setCategory: (v: string) => void;
  scenario: string; setScenario: (v: string) => void;
  materialsText: string; setMaterialsText: (v: string) => void;
  goalsText: string; setGoalsText: (v: string) => void;
  generating: boolean; genError: string;
  onGenerate: () => void;
}> = ({ appName, setAppName, category, setCategory, scenario, setScenario,
        materialsText, setMaterialsText, goalsText, setGoalsText,
        generating, genError, onGenerate }) => {

  const canGenerate = appName.trim() && category && scenario.trim();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* 说明 */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-brand-600/10 border border-brand-600/20">
        <Sparkles className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm text-slate-200 leading-relaxed font-medium">
            把你的合规经验变成一个会思考的智能体
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            描述你的业务场景，AI 自动构建专属智能体，包括资料清单、分析维度、报告模板。
            智能体会随着你的使用持续学习你的判断标准。
          </p>
        </div>
      </div>

      {/* 问题 1：智能体名称 + 分类 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">1</div>
          <label className="text-sm font-medium text-slate-200">这个智能体叫什么名字？属于哪个业务领域？</label>
        </div>
        <input
          value={appName}
          onChange={e => setAppName(e.target.value)}
          placeholder="如：劳动合规审查智能体、商业秘密保护评估智能体"
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
          autoFocus
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}>
              {CATEGORY_ICON[cat] || '⚖️'} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 问题 2：业务场景 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center text-xs text-white font-bold flex-shrink-0">2</div>
          <label className="text-sm font-medium text-slate-200">这个应用用于什么业务场景？</label>
        </div>
        <textarea
          value={scenario}
          onChange={e => setScenario(e.target.value)}
          placeholder="如：帮助客户做劳动合规审查，主要检查劳动合同规范性、社保缴纳情况、竞业限制协议有效性，识别潜在劳动纠纷风险"
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* 问题 3：资料清单（可选） */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 font-bold flex-shrink-0">3</div>
          <label className="text-sm font-medium text-slate-200">
            通常需要收集哪些资料？
            <span className="text-slate-500 font-normal ml-1">（可选，每行一项或逗号分隔）</span>
          </label>
        </div>
        <textarea
          value={materialsText}
          onChange={e => setMaterialsText(e.target.value)}
          placeholder="如：劳动合同、员工花名册、社保缴纳记录、竞业限制协议、薪酬制度"
          rows={3}
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 transition-colors resize-none leading-relaxed"
        />
      </div>

      {/* 问题 4：报告目标（可选） */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-400 font-bold flex-shrink-0">4</div>
          <label className="text-sm font-medium text-slate-200">
            最终报告需要回答哪些核心问题？
            <span className="text-slate-500 font-normal ml-1">（可选，每行一项）</span>
          </label>
        </div>
        <textarea
          value={goalsText}
          onChange={e => setGoalsText(e.target.value)}
          placeholder="如：劳动合同合规性评价&#10;社保缴纳是否足额&#10;竞业限制协议是否有效&#10;整体劳动风险评级"
          rows={4}
          className="w-full px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-brand-500 transition-colors resize-none leading-relaxed"
        />
      </div>

      {genError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {genError}
        </div>
      )}

      {/* 生成按钮 */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 text-white font-medium disabled:opacity-50 hover:bg-brand-700 transition-colors"
        >
          {generating
            ? <><RefreshCw className="w-4 h-4 animate-spin" />AI 生成中...</>
            : <><Wand2 className="w-4 h-4" />AI 生成模板</>
          }
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Step 2：确认 AI 生成的模板
// ─────────────────────────────────────────────────────────────────

const Step2: React.FC<{
  preview: AiGenerateResponse;
  editableItems: ChecklistItemPreview[]; setEditableItems: (v: ChecklistItemPreview[]) => void;
  editableDims: AnalysisDimensionPreview[]; setEditableDims: (v: AnalysisDimensionPreview[]) => void;
  saving: boolean; saveError: string;
  onBack: () => void; onSave: () => void; onRegenerate: () => void; generating: boolean;
}> = ({ preview, editableItems, setEditableItems, editableDims, setEditableDims,
        saving, saveError, onBack, onSave, onRegenerate, generating }) => {

  const updateItem = (idx: number, patch: Partial<ChecklistItemPreview>) =>
    setEditableItems(editableItems.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeItem = (idx: number) => setEditableItems(editableItems.filter((_, i) => i !== idx));
  const addItem = () => setEditableItems([...editableItems, { name: '', required: true, phase: '基础资料' }]);

  const updateDim = (idx: number, patch: Partial<AnalysisDimensionPreview>) =>
    setEditableDims(editableDims.map((d, i) => i === idx ? { ...d, ...patch } : d));
  const removeDim = (idx: number) => setEditableDims(editableDims.filter((_, i) => i !== idx));
  const addDim = () => setEditableDims([...editableDims, { name: '', outputField: `module_${editableDims.length + 1}` }]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* 生成成功提示 */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-emerald-300 font-medium">智能体「{preview.appName}」已生成</p>
          <p className="text-xs text-slate-400 mt-0.5">检查并调整下方配置，确认后即可使用。智能体会在你的项目中持续学习。</p>
        </div>
      </div>

      {/* 智能体简介 */}
      <div className="px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{CATEGORY_ICON[preview.category] || '⚖️'}</span>
          <span className="text-sm font-medium text-slate-200">{preview.appName}</span>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{preview.category}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{preview.description}</p>
      </div>

      {/* 资料清单 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-medium text-slate-200">资料清单</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{editableItems.length} 项</span>
          </div>
          <button onClick={addItem} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
            <Plus className="w-3.5 h-3.5" />添加资料
          </button>
        </div>
        <div className="space-y-2">
          {editableItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <button onClick={() => updateItem(idx, { required: !item.required })} title={item.required ? '必填' : '选填'}>
                {item.required
                  ? <ToggleRight className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  : <ToggleLeft className="w-4 h-4 text-slate-600 flex-shrink-0" />
                }
              </button>
              <input
                value={item.name}
                onChange={e => updateItem(idx, { name: e.target.value })}
                placeholder="资料名称"
                className="flex-1 bg-transparent text-sm text-slate-200 focus:outline-none placeholder:text-slate-600 min-w-0"
              />
              <span className={`text-xs flex-shrink-0 ${item.required ? 'text-brand-400' : 'text-slate-600'}`}>
                {item.required ? '必填' : '选填'}
              </span>
              <button onClick={() => removeItem(idx)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {editableItems.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-3">暂无资料项，点击「添加资料」</p>
          )}
        </div>
      </div>

      {/* 分析维度 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-brand-400" />
            <span className="text-sm font-medium text-slate-200">AI 分析维度</span>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{editableDims.length} 项</span>
          </div>
          <button onClick={addDim} className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
            <Plus className="w-3.5 h-3.5" />添加维度
          </button>
        </div>
        <div className="space-y-2">
          {editableDims.map((dim, idx) => (
            <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <span className="text-xs text-slate-600 flex-shrink-0 w-5 text-center">{idx + 1}</span>
              <input
                value={dim.name}
                onChange={e => updateDim(idx, { name: e.target.value })}
                placeholder="分析维度名称"
                className="flex-1 bg-transparent text-sm text-slate-200 focus:outline-none placeholder:text-slate-600 min-w-0"
              />
              <button onClick={() => removeDim(idx)} className="text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {editableDims.length === 0 && (
            <p className="text-xs text-slate-600 text-center py-3">暂无分析维度，点击「添加维度」</p>
          )}
        </div>
      </div>

      {/* 报告章节预览 */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-brand-400" />
          <span className="text-sm font-medium text-slate-200">报告章节</span>
          <span className="text-xs text-slate-500">（根据分析维度自动生成）</span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-700/50 space-y-1">
          {editableDims.map((dim, idx) => {
            const chNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
            return (
              <div key={idx} className="flex items-center gap-2 text-sm text-slate-400">
                <span className="text-slate-600 text-xs">第{chNums[idx] || idx + 1}章</span>
                <span>{dim.name || '（未命名）'}</span>
              </div>
            );
          })}
          {editableDims.length === 0 && <p className="text-xs text-slate-600">添加分析维度后自动生成报告章节</p>}
        </div>
      </div>

      {/* 共享说明 */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
        <Share2 className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          智能体默认仅你本人可见。保存后可在列表页开启「共享」，让同事使用并共同优化这个智能体。
        </p>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {saveError}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-between pt-2 pb-6">
        <button onClick={onRegenerate} disabled={generating}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          重新生成
        </button>
        <button onClick={onSave} disabled={saving || editableItems.length === 0 && editableDims.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 text-white font-medium disabled:opacity-50 hover:bg-brand-700 transition-colors">
          {saving
            ? <><RefreshCw className="w-4 h-4 animate-spin" />保存中...</>
            : <><CheckCircle2 className="w-4 h-4" />保存并开始使用<ArrowRight className="w-4 h-4" /></>
          }
        </button>
      </div>
    </div>
  );
};

export default AppCreateWizard;
