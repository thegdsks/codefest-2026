'use client';

import { useState } from 'react';
import type {
  AiSuggestResult,
  CreateRulePayload,
  RuleAction,
  RuleConditionGroup,
  RuleStatus,
} from '@/lib/rules-api';
import { defaultQuery } from './QueryBuilderConfig';

export interface RuleFormState {
  name: string;
  status: RuleStatus;
  whenConditions: RuleConditionGroup;
  whoConditions: RuleConditionGroup;
  action: RuleAction;
}

function emptyGroup(): RuleConditionGroup {
  return { combinator: 'and', rules: [] };
}

function defaultAction(): RuleAction {
  return {
    surface: 'banner',
    useAI: false,
    fallbackCopy: '',
    maxPerUserPerDay: 1,
  };
}

export function useRuleForm(initial?: Partial<RuleFormState>) {
  const [name, setName] = useState(initial?.name ?? '');
  const [status, setStatus] = useState<RuleStatus>(initial?.status ?? 'DRAFT');
  const [whenConditions, setWhenConditions] = useState<RuleConditionGroup>(
    initial?.whenConditions ?? emptyGroup()
  );
  const [whoConditions, setWhoConditions] = useState<RuleConditionGroup>(
    initial?.whoConditions ?? emptyGroup()
  );
  const [action, setAction] = useState<RuleAction>(initial?.action ?? defaultAction());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateAction(patch: Partial<RuleAction>) {
    setAction((prev) => ({ ...prev, ...patch }));
  }

  function applyAiSuggestion(result: AiSuggestResult) {
    if (result.name && !name.trim()) setName(result.name);
    setWhenConditions(result.conditions);
  }

  function toPayload(): CreateRulePayload {
    return { name, status, whenConditions, whoConditions, action };
  }

  return {
    name,
    setName,
    status,
    setStatus,
    whenConditions,
    setWhenConditions,
    whoConditions,
    setWhoConditions,
    action,
    updateAction,
    applyAiSuggestion,
    saving,
    setSaving,
    saveError,
    setSaveError,
    toPayload,
    defaultQuery,
  };
}
