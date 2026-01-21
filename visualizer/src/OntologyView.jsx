import React, { useMemo, useCallback, useState, useEffect } from 'react';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    Background,
    Controls,
    MarkerType,
    ReactFlowProvider,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

const nodeWidth = 220;
const nodeHeight = 80;

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: direction, ranksep: 200, nodesep: 150 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = direction === 'TB' ? 'top' : 'left';
        node.sourcePosition = direction === 'TB' ? 'bottom' : 'right';

        // We are shifting the dagre node position (anchor=center center) to the top left
        // so it matches the React Flow node anchor point (top left).
        node.position = {
            x: nodeWithPosition.x - nodeWidth / 2,
            y: nodeWithPosition.y - nodeHeight / 2,
        };

        return node;
    });

    return { nodes: layoutedNodes, edges };
};

const OntologyView = ({ data, onNodeSelect }) => {
    const { nodes: initialNodes, edges: initialEdges, moduleMap } = useMemo(() => {
        const modules = {};
        const moduleDependencies = {}; // sourceModule -> { targetModule: count }

        // 1. Group Classes by Module
        Object.values(data).forEach(cls => {
            let pathStr = cls.file_path || (cls.source_files && cls.source_files[0]?.path) || (cls.methods && cls.methods[0]?.bodyfile) || 'unknown/unknown';

            // Normalize Path to define "Module"
            // Strategy: Use top-level directory structure relevant to HDTN
            // e.g. "module/storage" -> "Storage"
            // "common/streaming" -> "Streaming"
            // "module/bpv6" -> "BPv6"

            let moduleName = 'Other';
            if (pathStr.startsWith('module/')) {
                const parts = pathStr.split('/');
                if (parts.length >= 2) moduleName = parts[1].toUpperCase(); // e.g. STORAGE, BPV6
            } else if (pathStr.startsWith('common/')) {
                const parts = pathStr.split('/');
                if (parts.length >= 2) moduleName = `Common-${parts[1]}`; // e.g. Common-Streaming
            } else if (pathStr.includes('/')) {
                moduleName = pathStr.split('/')[0];
            }

            // Cleanup
            moduleName = moduleName.replace(/[^a-zA-Z0-9-_]/g, '');

            if (!modules[moduleName]) {
                modules[moduleName] = {
                    id: moduleName,
                    classes: [],
                    metrics: { methods: 0, attributes: 0 }
                };
            }
            modules[moduleName].classes.push(cls);
            modules[moduleName].metrics.methods += (cls.methods?.length || 0);
            modules[moduleName].metrics.attributes += (cls.attributes?.length || 0);
        });

        // 2. Identify Edges (Inter-module calls)
        Object.values(modules).forEach(mod => {
            mod.classes.forEach(cls => {
                cls.methods?.forEach(m => {
                    m.references?.forEach(ref => {
                        // Ref format: "ClassName" or "ClassName::Method"
                        // Find target module
                        let targetClass = ref.split('::')[0];
                        if (targetClass === cls.name) return; // Self call

                        // Find which module targetClass belongs to
                        // This requires a reverse lookup or re-scan. 
                        // Optimization: Build global class->module map first? 
                        // Since we don't have it, we iterate modules (perf ok for this size).
                        let targetModName = null;
                        // Linear search is slow for 2000 classes * refs. 
                        // Let's build a quick lookup
                    });
                });
            });
        });

        // Optimization: Class -> Module Lookup
        const classToModule = {};
        Object.values(modules).forEach(mod => {
            mod.classes.forEach(c => classToModule[c.name] = mod.id);
        });

        // Now build edges
        Object.values(modules).forEach(mod => {
            mod.classes.forEach(cls => {
                cls.methods?.forEach(m => {
                    m.references?.forEach(ref => {
                        const targetClass = ref.split('::')[0];
                        if (targetClass === cls.name) return;

                        const targetMod = classToModule[targetClass];
                        if (targetMod && targetMod !== mod.id) {
                            if (!moduleDependencies[mod.id]) moduleDependencies[mod.id] = {};
                            if (!moduleDependencies[mod.id][targetMod]) {
                                moduleDependencies[mod.id][targetMod] = { count: 0, refs: [] };
                            }
                            moduleDependencies[mod.id][targetMod].count++;
                            moduleDependencies[mod.id][targetMod].refs.push({
                                source: cls.name,
                                target: targetClass,
                                method: m.name,
                                ref: ref
                            });
                        }
                    });
                });
            });
        });

        // 3. ReactFlow Nodes
        const flowNodes = Object.values(modules).map(mod => ({
            id: mod.id,
            data: {
                label: (
                    <div style={{ padding: '10px', textAlign: 'center' }}>
                        <strong style={{ display: 'block', borderBottom: '1px solid #555', paddingBottom: '4px', marginBottom: '4px', fontSize: '14px' }}>
                            {mod.id}
                        </strong>
                        <div style={{ fontSize: '10px', color: '#ccc' }}>
                            {mod.classes.length} Classes<br />
                            {mod.metrics.methods} Methods
                        </div>
                    </div>
                ),
                details: mod // Store full details for click handler
            },
            position: { x: 0, y: 0 },
            style: {
                background: '#2c313a',
                color: '#fff',
                border: '1px solid #61afef',
                borderRadius: '8px',
                width: 150
            },
            type: 'default'
        }));

        // 4. ReactFlow Edges
        const flowEdges = [];
        Object.keys(moduleDependencies).forEach(source => {
            Object.keys(moduleDependencies[source]).forEach(target => {
                const depData = moduleDependencies[source][target];
                const weight = depData.count;
                flowEdges.push({
                    id: `${source}-${target}`, // IMPORTANT: Consistent ID format
                    source,
                    target,
                    // label: weight > 5 ? `${weight}` : undefined, // Reduce clutter, show on hover/select
                    type: 'smoothstep',
                    style: { stroke: '#d19a66', strokeWidth: Math.min(Math.max(1, weight / 10), 5), opacity: 0.5 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#d19a66' },
                    animated: false, // Too distracting if all animate
                    data: { refs: depData.refs, weight } // Store references for detail view
                });
            });
        });

        const layout = getLayoutedElements(flowNodes, flowEdges, 'TB');
        return { nodes: layout.nodes, edges: layout.edges, moduleMap: modules };
    }, [data]);



    // Lifted state for local selection if onNodeSelect isn't enough OR we want to handle edge clicks too
    const [selectedId, setSelectedId] = useState(null);
    const [selectedType, setSelectedType] = useState(null); // 'node' | 'edge' | null
    const [selectedData, setSelectedData] = useState(null);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Filter/Highlight Logic
    useEffect(() => {
        if (!selectedId) {
            // Reset
            setNodes((nds) => nds.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } })));
            setEdges((eds) => eds.map((e) => ({
                ...e,
                style: { ...e.style, opacity: 0.5, stroke: '#d19a66' },
                animated: false,
                label: undefined
            })));
            return;
        }

        if (selectedType === 'node') {
            const connectedEdgeIds = new Set();
            const connectedNodeIds = new Set();
            connectedNodeIds.add(selectedId);

            initialEdges.forEach(e => {
                if (e.source === selectedId || e.target === selectedId) {
                    connectedEdgeIds.add(e.id);
                    connectedNodeIds.add(e.source);
                    connectedNodeIds.add(e.target);
                }
            });

            setNodes((nds) => nds.map((n) => ({
                ...n,
                style: {
                    ...n.style,
                    opacity: connectedNodeIds.has(n.id) ? 1 : 0.1
                }
            })));

            setEdges((eds) => eds.map((e) => ({
                ...e,
                style: {
                    ...e.style,
                    opacity: connectedEdgeIds.has(e.id) ? 1 : 0.05,
                    stroke: connectedEdgeIds.has(e.id) ? '#61afef' : '#d19a66'
                },
                animated: connectedEdgeIds.has(e.id),
                label: connectedEdgeIds.has(e.id) ? `${e.data.weight}` : undefined,
                zIndex: connectedEdgeIds.has(e.id) ? 999 : 0
            })));
        } else if (selectedType === 'edge') {
            // Highlight just this edge and its source/target
            const edge = initialEdges.find(e => e.id === selectedId);
            if (!edge) return;

            setNodes((nds) => nds.map((n) => ({
                ...n,
                style: {
                    ...n.style,
                    opacity: (n.id === edge.source || n.id === edge.target) ? 1 : 0.1
                }
            })));

            setEdges((eds) => eds.map((e) => ({
                ...e,
                style: {
                    ...e.style,
                    opacity: e.id === selectedId ? 1 : 0.05,
                    stroke: e.id === selectedId ? '#e06c75' : '#d19a66'
                },
                animated: true,
                zIndex: e.id === selectedId ? 999 : 0
            })));
        }

    }, [selectedId, selectedType, initialNodes, initialEdges, setNodes, setEdges]);

    // reset if data changes completely
    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);


    const onNodeClick = useCallback((event, node) => {
        if (onNodeSelect) onNodeSelect(node.data.details);
        setSelectedId(node.id);
        setSelectedType('node');
        setSelectedData(node.data.details);
    }, [onNodeSelect]);

    const onEdgeClick = useCallback((event, edge) => {
        setSelectedId(edge.id);
        setSelectedType('edge');
        setSelectedData(edge.data);
    }, []);

    const onPaneClick = useCallback(() => {
        setSelectedId(null);
        setSelectedType(null);
        setSelectedData(null);
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex' }}>
            <div style={{ flex: 1, height: '100%' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={onNodeClick}
                    onEdgeClick={onEdgeClick}
                    onPaneClick={onPaneClick}
                    fitView
                    attributionPosition="bottom-right"
                >
                    <Controls />
                    <Background color="#222" gap={16} />
                </ReactFlow>
            </div>

            {/* Details Panel */}
            {selectedData && (
                <div style={{
                    width: '350px',
                    background: '#1e2227',
                    borderLeft: '1px solid #333',
                    padding: '16px',
                    overflowY: 'auto',
                    color: '#dcdcdc',
                    boxShadow: '-4px 0 10px rgba(0,0,0,0.3)'
                }}>
                    <h2 style={{ borderBottom: '1px solid #61afef', paddingBottom: '8px', color: '#61afef', marginBottom: '16px' }}>
                        {selectedType === 'node' ? selectedData.id : 'Dependency Details'}
                    </h2>

                    {selectedType === 'node' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', background: '#282c34', padding: '10px', borderRadius: '4px' }}>
                                <div>
                                    <div style={{ fontSize: '10px', color: '#aaa' }}>CLASSES</div>
                                    <div style={{ fontSize: '16px' }}>{selectedData.classes.length}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '10px', color: '#aaa' }}>METHODS</div>
                                    <div style={{ fontSize: '16px' }}>{selectedData.metrics.methods}</div>
                                </div>
                            </div>
                            <h4 style={{ color: '#e5c07b', marginTop: '16px', marginBottom: '8px' }}>Classes</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {selectedData.classes.map(cls => (
                                    <div key={cls.name} style={{ padding: '6px', background: '#282c34', borderRadius: '4px', fontSize: '13px' }}>
                                        <div style={{ color: '#c678dd', fontWeight: 'bold' }}>{cls.name}</div>
                                        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{cls.methods?.length || 0} Methods</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedType === 'edge' && (
                        <div>
                            <div style={{ marginBottom: '16px', color: '#aaa', fontSize: '13px' }}>
                                {selectedData.refs.length} calls between modules
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {selectedData.refs.map((ref, idx) => (
                                    <div key={idx} style={{ padding: '8px', background: '#282c34', borderRadius: '4px', fontSize: '12px', borderLeft: '2px solid #e06c75' }}>
                                        <div style={{ color: '#61afef', marginBottom: '2px' }}>{ref.source}</div>
                                        <div style={{ color: '#aaa' }}>calls ➜ <span style={{ color: '#e5c07b' }}>{ref.target}::{ref.method}</span></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default OntologyView;
