import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, ChevronRight, Users, Clock, AlertCircle, RefreshCw } from 'lucide-react';

interface Project {
  id: number;
  enterpriseName: string;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
  appId?: number;
  checklistProgress?: { completed: number; total: number };
}

const STATUS_CONFIG = {
  ACTIVE:    { label: '进行中', color: 'text-emerald-400 bg-emerald-400/10' },
  COMPLETED: { label: '已完成', color: 'text-blue-400 bg-blue-400/10' },
  ARCHIVED:  { label: '已归档', color: 'text-slate-400 bg-slate-400/10' },
};

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await window.electronAPI.apiRequest('GET', '/api/projects');
      if (res.success) {
        // 后端返回 Page<ProjectResponse>，取 content 字段；也兼容直接返回数组
        const list = res.data?.content ?? res.data ?? [];
        setProjects(Array.isArray(list) ? list : []);
      } else {
        setError(res.error || '加载失败，请检查后端服务是否启动');
      }
    } catch (e: any) {
      setError(e.message || '网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  return (
    <div className="flex-1 flex flex-col h-full">
      <header className="h-14 flex items-center justify-between px-5 border-b border-slate-800 bg-slate-900/50">
        <h2 className="text-sm font-semibold text-slate-200">项目管理</h2>
        <div className="flex items-center gap-2">
          <button onClick={fetchProjects} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors" title="刷新">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/apps')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="w-4 h-4" />新建项目
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={fetchProjects} className="ml-auto text-xs underline">重试</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FolderKanban className="w-12 h-12 text-slate-600 mb-3" />
            <h3 className="text-slate-400 font-medium mb-1">暂无项目</h3>
            <p className="text-sm text-slate-600 mb-4">点击「新建项目」选择智能体，开始第一个合规项目</p>
            <button onClick={() => navigate('/apps')} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors">
              选择智能体
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {projects.map(project => {
              const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.ACTIVE;
              const progress = project.checklistProgress;
              return (
                <button
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="text-left bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 hover:bg-slate-800/30 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0 mr-3">
                      <h3 className="text-slate-100 font-medium truncate">{project.name}</h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Users className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="text-sm text-slate-400 truncate">{project.enterpriseName}</span>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${status.color}`}>{status.label}</span>
                  </div>

                  {project.description && (
                    <p className="text-sm text-slate-500 mb-3 line-clamp-2">{project.description}</p>
                  )}

                  {progress && progress.total > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">资料收集进度</span>
                        <span className="text-slate-400">{progress.completed}/{progress.total}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full transition-all"
                          style={{ width: `${(progress.completed / Math.max(progress.total, 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <Clock className="w-3 h-3" />
                      {new Date(project.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectsPage;
