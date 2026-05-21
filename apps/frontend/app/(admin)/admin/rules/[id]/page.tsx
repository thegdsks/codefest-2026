'use client';

import { Eye, FloppyDisk, Warning } from '@phosphor-icons/react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AuthGate from '@/components/admin/AuthGate';
import RuleExperienceViewer from '@/components/admin/RuleExperienceViewer';
import RuleActionPanel from '@/components/admin/rules/RuleActionPanel';
import RuleConditionsEditor from '@/components/admin/rules/RuleConditionsEditor';
import RulePreviewPanel from '@/components/admin/rules/RulePreviewPanel';
import StatusBadge from '@/components/admin/rules/StatusBadge';
import { useRuleForm } from '@/components/admin/rules/useRuleForm';
import Skeleton from '@/components/admin/Skeleton';
import { type EngagementRule, getRule, updateRule } from '@/lib/rules-api';
import type { ApiResult } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: 'DRAFT' as const, label: 'Draft' },
  { value: 'ACTIVE' as const, label: 'Active' },
  { value: 'ARCHIVED' as const, label: 'Archived' },
] as const;

function RuleEditorInner({ initial }: { initial: EngagementRule }) {
  const router = useRouter();
  const [experienceOpen, setExperienceOpen] = useState(false);
  const form = useRuleForm({
    name: initial.name,
    status: initial.status,
    whenConditions: initial.whenConditions,
    whoConditions: initial.whoConditions,
    action: initial.action,
  });

  const previewRule: EngagementRule = {
    ...initial,
    name: form.name,
    status: form.status,
    whenConditions: form.whenConditions,
    whoConditions: form.whoConditions,
    action: form.action,
  };

  async function handleSave() {
    if (!form.name.trim()) {
      form.setSaveError('Rule name is required.');
      return;
    }
    form.setSaving(true);
    form.setSaveError(null);
    try {
      const res = await updateRule(initial.ruleId, form.toPayload());
      if (res.error) {
        form.setSaveError(res.error.message);
        return;
      }
      router.refresh();
    } finally {
      form.setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <input
            type="text"
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            placeholder="Rule name..."
            className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-lg font-semibold text-[var(--text)] placeholder:font-normal placeholder:text-[var(--text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          />
          <select
            value={form.status}
            onChange={(e) => form.setStatus(e.target.value as typeof form.status)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            aria-label="Rule status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <StatusBadge status={form.status} />
        </div>
        <button
          type="button"
          onClick={() => setExperienceOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <Eye size={14} />
          Preview experience
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={form.saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
        >
          <FloppyDisk size={14} />
          {form.saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {form.saveError ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          <Warning size={14} className="shrink-0" />
          {form.saveError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <RuleConditionsEditor
              label="When (signals)"
              conditions={form.whenConditions}
              onChange={form.setWhenConditions}
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <RuleConditionsEditor
              label="Who (user attributes)"
              conditions={form.whoConditions}
              onChange={form.setWhoConditions}
            />
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
            <RuleActionPanel action={form.action} onChange={form.updateAction} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <RulePreviewPanel rule={previewRule} />
        </div>
      </div>

      <RuleExperienceViewer
        rule={previewRule}
        open={experienceOpen}
        onClose={() => setExperienceOpen(false)}
      />
    </div>
  );
}

export default function RuleEditorPage() {
  const params = useParams<{ id: string }>();
  const ruleId = params.id;
  const [result, setResult] = useState<ApiResult<EngagementRule> | null>(null);

  const load = useCallback(async () => {
    const res = await getRule(ruleId);
    setResult(res);
  }, [ruleId]);

  useEffect(() => {
    setResult(null);
    load();
  }, [load]);

  const data = result?.data ?? null;
  const err = result?.error ?? null;
  const loading = result === null;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (err && !data) {
    return <AuthGate error={err} onRetry={load} />;
  }

  if (!data) return null;

  return <RuleEditorInner initial={data} />;
}
