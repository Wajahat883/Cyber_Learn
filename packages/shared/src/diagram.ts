import { z } from 'zod';
import { VisualTypeSchema } from './analysis.js';

export const NodeKindSchema = z.enum(['source', 'processor', 'storage', 'destination', 'actor', 'decision', 'concept', 'event']);

const idPattern = /^[a-zA-Z0-9_-]{1,60}$/;

export const DiagramNodeSchema = z.object({
  id: z.string().regex(idPattern, 'Node ids may contain letters, digits, - and _'),
  label: z.string().min(1).max(80),
  kind: NodeKindSchema.default('concept'),
  description: z.string().max(600).default(''),
});

export const DiagramEdgeSchema = z.object({
  id: z.string().regex(idPattern),
  source: z.string().regex(idPattern),
  target: z.string().regex(idPattern),
  label: z.string().max(80).default(''),
});

export const MAX_DIAGRAM_NODES = 24;
export const MAX_DIAGRAM_EDGES = 40;

/**
 * Deterministic diagram definition (spec 5.4). The renderer only accepts
 * diagrams that pass this schema, so it never invents connections.
 */
export const DiagramSpecSchema = z
  .object({
    id: z.string().regex(idPattern),
    title: z.string().min(1).max(200),
    type: VisualTypeSchema,
    description: z.string().max(1000).default(''),
    sectionId: z.string().max(80).default(''),
    direction: z.enum(['LR', 'TB']).default('LR'),
    nodes: z.array(DiagramNodeSchema).min(1).max(MAX_DIAGRAM_NODES),
    edges: z.array(DiagramEdgeSchema).max(MAX_DIAGRAM_EDGES).default([]),
    /** Order in which nodes are revealed when the diagram animation is replayed. */
    steps: z.array(z.string()).max(MAX_DIAGRAM_NODES).default([]),
  })
  .superRefine((diagram, ctx) => {
    const nodeIds = new Set<string>();
    diagram.nodes.forEach((node, i) => {
      if (nodeIds.has(node.id)) ctx.addIssue({ code: 'custom', message: `Duplicate node id "${node.id}"`, path: ['nodes', i, 'id'] });
      nodeIds.add(node.id);
    });
    const edgeIds = new Set<string>();
    diagram.edges.forEach((edge, i) => {
      if (edgeIds.has(edge.id)) ctx.addIssue({ code: 'custom', message: `Duplicate edge id "${edge.id}"`, path: ['edges', i, 'id'] });
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.source)) ctx.addIssue({ code: 'custom', message: `Edge "${edge.id}" has unknown source "${edge.source}"`, path: ['edges', i, 'source'] });
      if (!nodeIds.has(edge.target)) ctx.addIssue({ code: 'custom', message: `Edge "${edge.id}" has unknown target "${edge.target}"`, path: ['edges', i, 'target'] });
      if (edge.source === edge.target) ctx.addIssue({ code: 'custom', message: `Edge "${edge.id}" connects a node to itself`, path: ['edges', i] });
    });
    diagram.steps.forEach((step, i) => {
      if (!nodeIds.has(step)) ctx.addIssue({ code: 'custom', message: `Step references unknown node "${step}"`, path: ['steps', i] });
    });
  });

/** What the AI diagram generator must return (ids/section are assigned by the backend). */
export const GeneratedDiagramSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  direction: z.enum(['LR', 'TB']).default('LR'),
  nodes: z.array(DiagramNodeSchema).min(1).max(MAX_DIAGRAM_NODES),
  edges: z.array(DiagramEdgeSchema).max(MAX_DIAGRAM_EDGES).default([]),
  steps: z.array(z.string()).max(MAX_DIAGRAM_NODES).default([]),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type DiagramNode = z.infer<typeof DiagramNodeSchema>;
export type DiagramEdge = z.infer<typeof DiagramEdgeSchema>;
export type DiagramSpec = z.infer<typeof DiagramSpecSchema>;
export type GeneratedDiagram = z.infer<typeof GeneratedDiagramSchema>;
