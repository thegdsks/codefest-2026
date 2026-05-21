'use client';

import { AlertCircle, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import RuleActionPanel from '@/components/admin/rules/RuleActionPanel';
import RuleConditionsEditor from '@/components/admin/rules/RuleConditionsEditor';
import StatusBadge from '@/components/admin/rules/StatusBadge';
import { useRuleForm } from '@/components/admin/rules/useRuleForm';
import { createRule } from '@/lib/rules-api';

const STATUS_OPTIONS = [
  { value: 'DRAFT' as const, label: 'Draft' },
  { value: 'ACTIVE' as const, label: 'Active' },
] as const;

export default function NewRulePage() {
  const router = useRouter();
  const form = useRuleForm();

  async function handleSave() {
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
        router.push(`/admin/rules/${encodeURIComponent(res.data.ruleId)}`);
      }
    } finally {
      form.setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <input
            type="text"
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
            placeholder="Rule name..."
            className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-lg font-semibold text-zinc-100 placeholder:font-normal placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
          />
          <select
            value={form.status}
            onChange={(e) => form.setStatus(e.target.value as typeof form.status)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
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
          onClick={handleSave}
          disabled={form.saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
        >
          <Save size={14} />
          {form.saving ? 'Saving...' : 'Create rule'}
        </button>
      </div>

      {form.saveError ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <AlertCircle size={14} className="shrink-0" />
          {form.saveError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <RuleConditionsEditor
              label="When (signals)"
              conditions={form.whenConditions}
              onChange={form.setWhenConditions}
            />
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <RuleConditionsEditor
              label="Who (user attributes)"
              conditions={form.whoConditions}
              onChange={form.setWhoConditions}
            />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <RuleActionPanel action={form.action} onChange={form.updateAction} />
        </div>
      </div>
    </div>
  );
}
