/**
 * Bootstrap Wizard —— 首启"克制承诺"引导。
 *
 * 修复：P0.1 / P1.1 / P1.19 / S3
 * 哲学（PRODUCT_PHILOSOPHY.md 第六章）入场承诺：
 *   "看着 Ovo 思考。它每一步都会告诉你为什么。"
 *   "Ovo 默认只看不做。当我观察到某个模式重复 3 次，会问你：要不要我下次替你做？"
 *
 * 与旧版差异：
 *   - 首屏第一句话从"5 分钟告诉 ovo 关于你"（灌输偏好）改为克制承诺
 *   - step 0/1 不再强制（interests/roles 可为空也能下一步）
 *   - 每一步都有独立的"跳过这一步"按钮（不再只能一次性跳过全部）
 *   - step 0 改成"承诺页"——用户先理解 Ovo 怎么工作，再决定填什么
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, ArrowRight, ArrowLeft, X, Check } from "lucide-react";

const isElectron = typeof window !== "undefined" && !!window.ovoAPI;

const PRESET_INTERESTS = [
  "AI / 大模型", "投资 / 加密资产", "创业 / 产品", "编程 / 工程",
  "设计 / 视觉", "写作 / 自媒体", "学习 / 阅读", "健身 / 健康",
  "育儿 / 家庭", "音乐 / 影视", "旅行", "心理学"
];

const PRESET_ROLES = [
  "创业者 / 产品经理", "工程师 / 程序员", "设计师 / 创作者",
  "投资者 / Trader", "学生 / 研究者", "父母", "管理者", "自由职业者"
];

interface Props {
  onClose: () => void;
}

export function BootstrapWizard({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [customInterest, setCustomInterest] = useState("");
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [project, setProject] = useState("");
  const [saving, setSaving] = useState(false);

  const interestList = useMemo(() => Array.from(interests), [interests]);
  const roleList = useMemo(() => Array.from(roles), [roles]);

  const toggle = (set: Set<string>, val: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val); else next.add(val);
    setter(next);
  };

  const addCustomInterest = () => {
    const v = customInterest.trim();
    if (!v) return;
    const next = new Set(interests);
    next.add(v);
    setInterests(next);
    setCustomInterest("");
  };

  const handleFinish = async () => {
    if (!isElectron) { onClose(); return; }
    setSaving(true);
    try {
      await window.ovoAPI.prefs.saveBootstrap({
        interests: interestList,
        currentProject: project,
        roles: roleList
      });
    } finally {
      setSaving(false);
      onClose();
    }
  };

  const handleSkip = async () => {
    // 跳过也写入完成标记，避免反复弹
    if (isElectron) {
      try { await window.ovoAPI.prefs.saveBootstrap({ interests: [], currentProject: "", roles: [] }); } catch { /* ignore */ }
    }
    onClose();
  };

  // P0.1 / P1.19：step 标题去工程化、step 0/1 不再强制选择（0 个也可下一步）
  const stepTitles = ["关心的主题（可选）", "你的角色（可选）", "当前主项目（可选）", "完成"];
  const canNext = true; // 任何一步都不强制填写，用户随时可以跳过

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative flex h-[600px] w-[640px] max-w-[92vw] flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl">
        {/* 头部 — 哲学第六章"入场承诺" */}
        <div className="border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles size={18} className="mt-0.5 text-[var(--accent)]" />
              <div>
                <p className="text-base font-semibold">看着 Ovo 思考</p>
                <p className="text-xs text-[var(--text-secondary)]">它每一步都会告诉你为什么</p>
              </div>
            </div>
            <button type="button" onClick={() => void handleSkip()} className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)]" title="跳过全部">
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Ovo 默认只看不做。观察到某个模式重复 3 次后，会问你：要不要替你做？
          </p>
          <p className="mt-1 text-[10px] text-[var(--text-muted)]">第 {step + 1} / 4 步：{stepTitles[step]} · 全部可跳过</p>
        </div>

        {/* 进度条 */}
        <div className="h-1 bg-[var(--border)]/50">
          <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${((step + 1) / 4) * 100}%` }} />
        </div>

        {/* 主体 */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                如果你愿意，告诉 Ovo 你关心什么——它会用这些先验更快进入状态。
                <span className="ml-1 text-[var(--text-muted)]">不填也行，Ovo 会自己慢慢学。</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_INTERESTS.map((it) => (
                  <button
                    key={it}
                    type="button"
                    onClick={() => toggle(interests, it, setInterests)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      interests.has(it)
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {it}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customInterest}
                  onChange={(e) => setCustomInterest(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomInterest(); }}
                  placeholder="输入其他主题，回车添加（如 BTC HODLer / Three.js）"
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={addCustomInterest}
                  className="rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:border-[var(--accent)]"
                >
                  添加
                </button>
              </div>
              {interestList.length > 0 && (
                <div className="rounded-lg bg-[var(--bg-base)] p-3">
                  <p className="mb-1 text-xs text-[var(--text-muted)]">已选 ({interestList.length})</p>
                  <p className="text-xs">{interestList.join(" · ")}</p>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                你扮演哪些角色？多选。
                <span className="ml-1 text-[var(--text-muted)]">同样可以不选。</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggle(roles, r, setRoles)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      roles.has(r)
                        ? "border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                你目前正在做什么大事？一句话描述就行（这一步可跳过）。
              </p>
              <textarea
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder={`例：\n  - "在做一个法律咨询小程序，下个月想上线"\n  - "在准备 YC 申请"\n  - "在调研 BTC ETF 投资策略"`}
                className="h-32 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <p className="text-xs text-[var(--text-muted)]">
                ovo 会把这条记进知识库（pinned），让它在所有 prompt 里都能看到。
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm">Ovo 现在知道：</p>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-4 text-sm">
                <div className="mb-2">
                  <p className="text-xs text-[var(--text-muted)]">关注主题</p>
                  <p>{interestList.length > 0 ? interestList.join(" · ") : "暂未填写"}</p>
                </div>
                <div className="mb-2">
                  <p className="text-xs text-[var(--text-muted)]">扮演角色</p>
                  <p>{roleList.length > 0 ? roleList.join(" · ") : "暂未填写"}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)]">当前主项目</p>
                  <p>{project || "暂未填写"}</p>
                </div>
              </div>
              <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3 text-xs text-[var(--text-secondary)]">
                <p className="mb-1 font-medium text-[var(--text-primary)]">接下来 Ovo 会做的事</p>
                <p>· 默认只看不做——观察你的工作场景</p>
                <p>· 想做事时先告诉你："看见 X · 想做 Y · 因为 Z"</p>
                <p>· 永远显示完整推理路径，你可以随时教它"不要这样"</p>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                填的内容立刻写进知识库（钉住），后面在「设置 → 数据管理」可以随时改。
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮 — P1.19: 增加"跳过这一步"，与"跳过全部"区分语义 */}
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={() => void handleSkip()}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            跳过全部
          </button>
          <div className="ml-auto flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:border-[var(--accent)]"
              >
                <ArrowLeft size={12} />上一步
              </button>
            )}
            {step < 3 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="rounded-md border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
              >
                跳过这一步
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                disabled={!canNext}
                onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                下一步<ArrowRight size={12} />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleFinish()}
                className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                <Check size={12} />{saving ? "保存中..." : "好的，开始"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* 包装：检查首启状态 + P0.8 启动状态机：必须先权限授权才弹 wizard，避免多层模态叠加 */
export function BootstrapWizardGate() {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);
  // P0.8：等权限授权完成后再弹 wizard，避免与 PermissionGate 教学弹窗同时出现
  const [permGranted, setPermGranted] = useState(false);

  useEffect(() => {
    if (!isElectron) { setChecked(true); setPermGranted(true); return; }
    void window.ovoAPI.prefs.getBootstrapStatus().then((status) => {
      if (!status.done) setShow(true);
      setChecked(true);
    }).catch(() => setChecked(true));
    // 检查屏幕权限（轮询一次即可，PermissionGate 自己有 3s 轮询）
    void window.ovoAPI.permissions.getStatus().then((s) => {
      const granted = (s as { screenRecording?: string }).screenRecording === "granted";
      setPermGranted(granted);
    }).catch(() => setPermGranted(false));
    // 订阅权限状态变更事件
    const off = window.ovoAPI.on("permissions:status", (payload) => {
      if (payload?.screen === "granted") setPermGranted(true);
    });
    return () => { try { off(); } catch { /* */ } };
  }, []);

  if (!checked || !show) return null;
  // P0.8：权限未授权时不弹 wizard，避免与 PermissionGate 教学弹窗同时出现
  if (!permGranted) return null;
  return <BootstrapWizard onClose={() => setShow(false)} />;
}
