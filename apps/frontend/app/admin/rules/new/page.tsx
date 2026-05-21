'use client';

import { Save, Sparkles, TriangleAlert, Wrench } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import RuleActionPanel from '@/components/admin/rules/RuleActionPanel';
import RuleActionTemplates from '@/components/admin/rules/RuleActionTemplates';
import RuleAiAssistTab from '@/components/admin/rules/RuleAiAssistTab';
import RuleConditionsEditor from '@/components/admin/rules/RuleConditionsEditor';
import RuleDisclaimers from '@/components/admin/rules/RuleDisclaimers';
import RuleLivePreview from '@/components/admin/rules/RuleLivePreview';
import StatusBadge from '@/components/admin/rules/StatusBadge';
import { useRuleForm } from '@/components/admin/rules/useRuleForm';
import { createRule } from '@/lib/rules-api';

const STATUS_OPTIONS = [
  { value: 'DRAFT' as const, label: 'Draft' },
  { value: 'ACTIVE' as const, label: 'Active' },
] as const;

type EditorTab = 'visual' | 'ai';

const TABS: Array<{ value: EditorTab; label: string; icon: typeof Wrench }> = [
  { value: 'visual', label: 'Visual', icon: Wrench },
  { value: 'ai', label: 'AI Assist', icon: Sparkles },
];

export default function NewRulePage() {
  const router = useRouter();
  const form = useRuleForm();
  const [tab, setTab] = useState<EditorTab>('visual');

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
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
          <Save className="size-4" />
          {form.saving ? 'Saving...' : 'Create rule'}
        </button>
      </div>

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

      <div className="mb-4 flex w-fit items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1">
        {TABS.map(({ value, label, icon: Icon }) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                active
                  ? 'bg-indigo-500/10 text-indigo-200 ring-1 ring-indigo-400/40'
                  : 'text-zinc-400 hover:text-zinc-100'
              }`}
              aria-pressed={active}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {tab === 'visual' ? (
            <>
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
            </>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
              <RuleAiAssistTab onApply={form.applyAiSuggestion} />
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <RuleActionTemplates action={form.action} onApply={form.updateAction} />
          </div>

          <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 [&[open]>summary]:mb-4">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Action details
            </summary>
            <RuleActionPanel action={form.action} onChange={form.updateAction} />
          </details>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-4">
            <RuleLivePreview payload={form.toPayload()} />
          </div>
        </aside>
      </div>
    </div>
  );
}
