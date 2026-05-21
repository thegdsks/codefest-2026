'use client';

import { ChevronDown, ChevronRight, Sparkles, TriangleAlert, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SIGNAL_FIELDS, USER_FIELDS } from '@/components/admin/rules/QueryBuilderConfig';
import RuleActionPanel from '@/components/admin/rules/RuleActionPanel';
import RuleActionTemplates from '@/components/admin/rules/RuleActionTemplates';
import RuleAiAssistTab from '@/components/admin/rules/RuleAiAssistTab';
import RuleConditionsEditor from '@/components/admin/rules/RuleConditionsEditor';
import RuleDisclaimers from '@/components/admin/rules/RuleDisclaimers';
import RuleLivePreview from '@/components/admin/rules/RuleLivePreview';
import StatusBadge from '@/components/admin/rules/StatusBadge';
import { useRuleForm } from '@/components/admin/rules/useRuleForm';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Tooltip } from '@/components/ui/Tooltip';
import { createRule, type RuleConditionGroup } from '@/lib/rules-api';

const STATUS_OPTIONS = [
  { value: 'DRAFT' as const, label: 'Draft' },
  { value: 'ACTIVE' as const, label: 'Active' },
] as const;

type EditorTab = 'visual' | 'ai';

const TABS: Array<{ value: EditorTab; label: string; icon: typeof Wrench }> = [
  { value: 'visual', label: 'Visual', icon: Wrench },
  { value: 'ai', label: 'AI Assist', icon: Sparkles },
];

function countRules(group: RuleConditionGroup): number {
  let count = 0;
  for (const r of group.rules) {
    if ('combinator' in r) {
      count += countRules(r);
    } else {
      count += 1;
    }
  }
  return count;
}

function computeWarningCount(
  whenConditions: RuleConditionGroup,
  whoConditions: RuleConditionGroup,
  action: { actionType?: string; surface: string; score?: number }
): number {
  let n = 0;
  if (countRules(whenConditions) + countRules(whoConditions) === 0) n += 1;
  if (typeof action.score === 'number' && (action.score > 90 || action.score < 10)) n += 1;
  if (action.actionType === 'HINT' && action.surface !== 'tooltip') n += 1;
  return n;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface SaveBarProps {
  name: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  saving: boolean;
  warningCount: number;
  ready: boolean;
  lastSavedAt: number | null;
  onNameChange: (name: string) => void;
  onStatusChange: (status: 'DRAFT' | 'ACTIVE') => void;
  onCancel: () => void;
  onSave: () => void;
}

function SaveBar({
  name,
  status,
  saving,
  warningCount,
  ready,
  lastSavedAt,
  onNameChange,
  onStatusChange,
  onCancel,
  onSave,
}: SaveBarProps) {
  const issueText =
    warningCount === 0 ? 'Name required' : `${warningCount} issue${warningCount > 1 ? 's' : ''}`;
  const tooltipText =
    warningCount === 0
      ? 'No issues detected.'
      : `${warningCount} issue${warningCount > 1 ? 's' : ''}. See banners below for details.`;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Rule name"
            aria-label="Rule name"
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-lg font-semibold text-[color:var(--text)] placeholder:font-normal placeholder:text-[color:var(--text-dim)] hover:border-[color:var(--border)] focus-visible:border-[color:var(--border-strong)] focus-visible:bg-[color:var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          />
          <select
            value={status}
            onChange={(e) => onStatusChange(e.target.value as 'DRAFT' | 'ACTIVE')}
            className="rounded-md border border-[color:var(--border-strong)] bg-[color:var(--bg-surface)] px-2 py-1.5 text-xs text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            aria-label="Rule status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <StatusBadge status={status} />
        </div>

        <div className="flex items-center justify-center">
          <Tooltip content={tooltipText} side="bottom">
            <button
              type="button"
              aria-label="Validation summary"
              className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
            >
              {ready ? (
                <Badge variant="success" size="md">
                  Ready to save
                </Badge>
              ) : (
                <Badge variant="warning" size="md">
                  {issueText}
                </Badge>
              )}
            </button>
          </Tooltip>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-md px-3 py-1.5 text-sm text-[color:var(--text-muted)] hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            title="Cmd+S"
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
          >
            {saving ? 'Saving...' : 'Save'}
            {lastSavedAt && !saving ? (
              <span className="text-[11px] font-normal text-indigo-100/80">
                saved {formatTime(lastSavedAt)}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConditionsPanelProps {
  whenConditions: RuleConditionGroup;
  whoConditions: RuleConditionGroup;
  showWho: boolean;
  onWhenChange: (g: RuleConditionGroup) => void;
  onWhoChange: (g: RuleConditionGroup) => void;
  onToggleWho: () => void;
}

function ConditionsPanel({
  whenConditions,
  whoConditions,
  showWho,
  onWhenChange,
  onWhoChange,
  onToggleWho,
}: ConditionsPanelProps) {
  const whoCount = countRules(whoConditions);
  return (
    <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          Conditions
        </h3>
        <Tooltip
          content="Define which engagement events trigger this rule, and optionally narrow by user attributes."
          side="left"
        >
          <span className="cursor-help text-[11px] text-[color:var(--text-dim)]">
            What is this?
          </span>
        </Tooltip>
      </div>

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-dim)]">
        When (signals)
      </div>
      <RuleConditionsEditor
        conditions={whenConditions}
        onChange={onWhenChange}
        fieldFilter={(f) => SIGNAL_FIELDS.has(f.name)}
      />

      <button
        type="button"
        onClick={onToggleWho}
        aria-expanded={showWho}
        className="mt-5 flex w-full items-center justify-between rounded-md border border-[color:var(--border)] bg-[color:var(--bg)]/60 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] hover:bg-[color:var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70"
      >
        <span className="flex items-center gap-2">
          {showWho ? (
            <ChevronDown className="size-3.5 text-[color:var(--text-dim)]" />
          ) : (
            <ChevronRight className="size-3.5 text-[color:var(--text-dim)]" />
          )}
          Who (user attributes)
        </span>
        <span className="text-[10px] font-normal text-[color:var(--text-dim)]">
          {whoCount > 0 ? `${whoCount} active` : 'optional'}
        </span>
      </button>
      {showWho ? (
        <div className="mt-3">
          <RuleConditionsEditor
            conditions={whoConditions}
            onChange={onWhoChange}
            fieldFilter={(f) => USER_FIELDS.has(f.name)}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function NewRulePage() {
  const router = useRouter();
  const form = useRuleForm();
  const [tab, setTab] = useState<EditorTab>('visual');
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const whoHasConditions = countRules(form.whoConditions) > 0;
  const [showWho, setShowWho] = useState<boolean>(whoHasConditions);

  // Auto-expand the user-attributes section once a who-condition exists.
  useEffect(() => {
    if (whoHasConditions) setShowWho(true);
  }, [whoHasConditions]);

  const warningCount = useMemo(
    () => computeWarningCount(form.whenConditions, form.whoConditions, form.action),
    [form.whenConditions, form.whoConditions, form.action]
  );

  const ready = warningCount === 0 && form.name.trim().length > 0;

  const performSave = useCallback(async () => {
    if (!form.name.trim()) {
      form.setSaveError('Rule name is required.');
      return;
    }
    form.setSaving(true);
    form.setSaveError(null);
    try {
      const res = await createRule(form.toPayload());
      if (res.error) {
        form.setSaveError(res.error.message);
        return;
      }
      if (res.data) {
        setLastSavedAt(Date.now());
        router.push(`/admin/rules/${encodeURIComponent(res.data.ruleId)}`);
      }
    } finally {
      form.setSaving(false);
    }
  }, [form, router]);

  const handleSave = useCallback(() => {
    if (form.status === 'ACTIVE') {
      setShowActivateConfirm(true);
      return;
    }
    void performSave();
  }, [form.status, performSave]);

  // Cmd+S keyboard shortcut.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!form.saving) handleSave();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [form.saving, handleSave]);

  return (
    <div className="mx-auto max-w-7xl">
      <SaveBar
        name={form.name}
        status={form.status}
        saving={form.saving}
        warningCount={warningCount}
        ready={ready}
        lastSavedAt={lastSavedAt}
        onNameChange={form.setName}
        onStatusChange={form.setStatus}
        onCancel={() => router.back()}
        onSave={handleSave}
      />

      {form.saveError ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <TriangleAlert className="size-4 shrink-0" />
          {form.saveError}
        </div>
      ) : null}

      <RuleDisclaimers
        whenConditions={form.whenConditions}
        whoConditions={form.whoConditions}
        action={form.action}
      />

      <div className="mb-4 flex w-fit items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)]/60 p-1">
        {TABS.map(({ value, label, icon: Icon }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 ${
                active
                  ? 'bg-indigo-500/10 text-indigo-200 ring-1 ring-indigo-400/40'
                  : 'text-[color:var(--text-muted)] hover:text-[color:var(--text)]'
              }`}
              aria-pressed={active}
            >
              <Icon className="size-3.5" />
              {label}
              {value === 'ai' && (
                <span className="inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider bg-[color:var(--info-bg)] text-[color:var(--info-fg)] border border-[color:var(--info-border)]">
                  BETA
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {tab === 'visual' ? (
            <ConditionsPanel
              whenConditions={form.whenConditions}
              whoConditions={form.whoConditions}
              showWho={showWho}
              onWhenChange={form.setWhenConditions}
              onWhoChange={form.setWhoConditions}
              onToggleWho={() => setShowWho((v) => !v)}
            />
          ) : (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-5">
              <RuleAiAssistTab onApply={form.applyAiSuggestion} />
            </div>
          )}

          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-5">
            <RuleActionTemplates action={form.action} onApply={form.updateAction} />
          </div>

          <details className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-surface)]/40 p-5 [&[open]>summary]:mb-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Action details
            </summary>
            <RuleActionPanel action={form.action} onChange={form.updateAction} />
          </details>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-24">
            <RuleLivePreview payload={form.toPayload()} />
          </div>
        </aside>
      </div>

      <Modal
        open={showActivateConfirm}
        onOpenChange={setShowActivateConfirm}
        title="Activate rule?"
        description="Activating starts matching live engagement traffic immediately. Continue?"
        cancelLabel="Cancel"
        confirmLabel="Activate and save"
        onConfirm={() => {
          setShowActivateConfirm(false);
          void performSave();
        }}
        confirmLoading={form.saving}
      />
    </div>
  );
}
