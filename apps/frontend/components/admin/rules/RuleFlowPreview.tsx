'use client';

import { Background, Handle, type NodeProps, Position, ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { EngagementRule } from '@/lib/rules-api';

interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string; sublabel?: string };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

interface LabelNodeData extends Record<string, unknown> {
  label: string;
  sublabel?: string;
}

function LabelNode({ data }: NodeProps) {
  const { label, sublabel } = data as LabelNodeData;
  return (
    <div className="rounded-lg border border-[color:var(--border-strong)] bg-[color:var(--bg-surface)] px-4 py-3 text-center shadow-md min-w-[140px]">
      <Handle type="target" position={Position.Left} className="opacity-0" />
      <div className="text-xs font-medium text-[color:var(--text)]">{label}</div>
      {sublabel ? (
        <div className="mt-0.5 text-[10px] text-[color:var(--text-dim)]">{sublabel}</div>
      ) : null}
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

const nodeTypes = { labelNode: LabelNode };

interface RuleFlowPreviewProps {
  rule: EngagementRule;
}

export default function RuleFlowPreview({ rule }: RuleFlowPreviewProps) {
  const conditionCount = rule.whenConditions.rules.length + rule.whoConditions.rules.length;

  const nodes: FlowNode[] = [
    {
      id: 'signal',
      type: 'labelNode',
      position: { x: 0, y: 60 },
      data: {
        label: 'Signal',
        sublabel: `${conditionCount} condition${conditionCount !== 1 ? 's' : ''}`,
      },
    },
    {
      id: 'condition',
      type: 'labelNode',
      position: { x: 200, y: 60 },
      data: {
        label: 'Evaluate',
        sublabel: 'WHEN + WHO',
      },
    },
    {
      id: 'ai',
      type: 'labelNode',
      position: { x: 400, y: 60 },
      data: {
        label: rule.action.useAI ? 'AI Content' : 'Catalog Copy',
        sublabel: rule.action.useAI ? 'LLM personalized' : 'Fallback text',
      },
    },
    {
      id: 'surface',
      type: 'labelNode',
      position: { x: 600, y: 60 },
      data: {
        label: 'Surface',
        sublabel: rule.action.surface,
      },
    },
  ];

  const edges: FlowEdge[] = [
    { id: 'e1', source: 'signal', target: 'condition', animated: true },
    { id: 'e2', source: 'condition', target: 'ai', animated: true },
    { id: 'e3', source: 'ai', target: 'surface', animated: true },
  ];

  return (
    <div className="h-48 w-full overflow-hidden rounded-lg border border-[color:var(--border)] bg-[color:var(--bg)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background color="#3f3f46" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
