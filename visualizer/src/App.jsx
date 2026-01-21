import React, { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import 'reactflow/dist/style.css';
import './App.css';
import SequenceView from './SequenceView';
import OntologyView from './OntologyView';

// --- Custom Edge Label Component ---
const CallEdgeLabel = ({ calls }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="nopan"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        background: '#111',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid #555',
        fontSize: '10px',
        cursor: 'pointer',
        position: 'relative',
        color: '#e0e0e0',
        pointerEvents: 'all'
      }}
    >
      calls
      {showTooltip && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 0, 0, 0.95)',
          border: '1px solid #61afef',
          borderRadius: '4px',
          padding: '8px',
          minWidth: '200px',
          zIndex: 9999,
          marginBottom: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          whiteSpace: 'nowrap'
        }}>
          <div style={{
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#61afef',
            marginBottom: '4px',
            borderBottom: '1px solid #333',
            paddingBottom: '2px'
          }}>
            Method Calls ({calls.length})
          </div>
          <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
            {calls.map((call, i) => (
              <div key={i} style={{ fontSize: '10px', fontFamily: 'monospace', color: '#abb2bf', padding: '2px 0' }}>
                {call}
              </div>
            ))}
          </div>
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            marginLeft: '-5px',
            borderWidth: '5px',
            borderStyle: 'solid',
            borderColor: '#61afef transparent transparent transparent'
          }}></div>
        </div>
      )}
    </div>
  );
};

// --- Layout Helper ---
const nodeWidth = 240;
const nodeHeight = 100;

const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // LR = Left to Right (results in vertical columns of siblings)
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 60,  // Reduced from 100 for tighter packing
    ranksep: 200  // Reduced from 400 for tighter packing
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (nodeWithPosition) {
      node.position = {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeight / 2,
      };
    }

    // Adjust handles for the layout direction
    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';

    return node;
  });

  return { nodes: layoutedNodes, edges };
};

// --- Inner Component (Access to ReactFlow Context) ---
const HDTNVisualizer = () => {
  const { getNodes, getEdges, fitView } = useReactFlow();

  // Local state for ReactFlow managed logic if needed, 
  // but useReactFlow setNodes handles the store.
  // HOWEVER, useNodesState is still useful for initial sync.
  // We can stick to useNodesState linked to the store? 
  // Standard pattern: pass nodes/edges to <ReactFlow> and use setNodes provided by useNodesState.
  // But for runAutoLayout, we use getNodes().

  const [nodes, setNodesState, onNodesChange] = useNodesState([]);
  const [edges, setEdgesState, onEdgesChange] = useEdgesState([]);

  const [fullData, setFullData] = useState({});
  const [logs, setLogs] = useState(["Welcome to HDTN Interactive Tool V3."]);

  const [selectedNodeData, setSelectedNodeData] = useState(null);
  const [selectedEdgeData, setSelectedEdgeData] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showAllClassesModal, setShowAllClassesModal] = useState(false);

  const [layoutDirection, setLayoutDirection] = useState('TB'); // Default to Horizontal (Top-Bottom)
  const [activeTab, setActiveTab] = useState('graph'); // 'graph' or 'sequence'
  const [classSearchTerm, setClassSearchTerm] = useState(''); // Search term for Add One Class modal
  const [activeModalTab, setActiveModalTab] = useState('source');

  const [activeSourceIndex, setActiveSourceIndex] = useState(0);
  const [baseDepth, setBaseDepth] = useState(1);
  const [derivedDepth, setDerivedDepth] = useState(1);
  const [sourceContent, setSourceContent] = useState('');
  const [loadingSource, setLoadingSource] = useState(false);

  const addLog = (msg) => setLogs(prev => [msg, ...prev].slice(0, 5));

  // Load Data
  useEffect(() => {
    fetch('/hdtn_api_spec.json')
      .then((res) => res.json())
      .then((data) => {
        setFullData(data);
        addLog(`Loaded API Spec: ${Object.keys(data).length} classes.`);
      })
      .catch((err) => {
        console.error("Failed to load API data", err);
        addLog("Error loading API data.");
      });
  }, []);

  // Load Source Content
  useEffect(() => {
    if (showSourceModal && selectedNodeData?.source_files?.length > 0) {
      const idx = activeSourceIndex < selectedNodeData.source_files.length ? activeSourceIndex : 0;
      const file = selectedNodeData.source_files[idx];
      if (file) {
        const loadSource = async () => {
          setLoadingSource(true);
          try {
            const res = await fetch(file.url);
            const text = await res.text();
            setSourceContent(text);
          } catch (e) {
            setSourceContent("// Error loading source: " + e.message);
          } finally {
            setLoadingSource(false);

            // Auto-scroll logic if method selected
            if (selectedMethod && selectedMethod.bodystart) {
              setTimeout(() => {
                const codeEl = document.getElementById('source-code-pre');
                if (codeEl) {
                  const scrollY = (selectedMethod.bodystart - 5) * 19.5;
                  codeEl.parentElement.scrollTop = scrollY > 0 ? scrollY : 0;
                }
              }, 300);
            }
          }
        };
        loadSource();
      }
    }
  }, [showSourceModal, selectedNodeData, activeSourceIndex, selectedMethod]);

  const runAutoLayout = useCallback((focusNodeIds = []) => {
    // use getNodes() to ensure we have LATEST state (avoiding closure staleness)
    const currentNodes = getNodes();
    const currentEdges = getEdges();

    if (currentNodes.length === 0) return;

    const layout = getLayoutedElements(currentNodes, currentEdges, layoutDirection);
    setNodesState([...layout.nodes]);
    setEdgesState([...layout.edges]);

    // Force fit view after layout
    setTimeout(() => {
      // Ensure focusNodeIds is an array (it might be an event object if called via button)
      if (Array.isArray(focusNodeIds) && focusNodeIds.length > 0) {
        fitView({
          nodes: focusNodeIds.map(id => ({ id })),
          padding: 0.2,
          duration: 800,
          maxZoom: 1.5
        });
      } else {
        fitView({ padding: 0.2, duration: 800 });
      }
    }, 50);
    addLog(`Graph layout updated (${layoutDirection}).`);
  }, [getNodes, getEdges, setNodesState, setEdgesState, fitView, layoutDirection]);

  // --- Add Node Helper ---
  const addNodeToGraph = (className, originNodeId = null, relationshipType = null) => {
    const cls = fullData[className];
    if (!cls) {
      // Silent fail or log?
      console.warn(`Class ${className} not found.`);
      return;
    }

    setNodesState((prevNodes) => {
      if (prevNodes.find((n) => n.id === className)) return prevNodes;

      // Calculate position relative to origin to keep context
      let initialPos = { x: 0, y: 0 };
      if (originNodeId) {
        const originNode = prevNodes.find(n => n.id === originNodeId);
        if (originNode) {
          // Place to the right with some randomness to avoid stacking
          initialPos = {
            x: originNode.position.x + 300,
            y: originNode.position.y + (Math.random() * 150 - 75)
          };
        }
      } else {
        // If adding without origin (e.g. from search), offset slightly from center or 0,0
        // or just leave at 0,0 and let user move it.
        initialPos = { x: Math.random() * 100, y: Math.random() * 100 };
      }

      return [...prevNodes, {
        id: className,
        data: { label: className, details: cls },
        position: initialPos,
        sourcePosition: 'right',
        targetPosition: 'left',
        style: {
          background: '#0a0a0a',
          color: '#e0e0e0',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '12px',
          minWidth: '200px',
          fontSize: '14px',
          fontFamily: "'JetBrains Mono', monospace",
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }
      }];
    });

    if (originNodeId) {
      const edgeId = `${originNodeId}-${className}-${relationshipType}`;
      setEdgesState((prevEdges) => {
        if (prevEdges.find((e) => e.id === edgeId)) return prevEdges;
        addLog(`Linked ${originNodeId} -> ${className}`);

        let strokeColor = '#555';
        let strokeDash = '0';
        if (relationshipType === 'inherits') strokeColor = '#d19a66';
        if (relationshipType === 'calls' || relationshipType === 'called_by') { strokeColor = '#61afef'; strokeDash = '5'; }

        // Direction:
        // derived: Origin -> Derived (Parent -> Child)
        // base: Origin -> Base (Child -> Parent? No, usually Parent -> Child logic in tree)
        // Let's stick to strict:
        // if type='base' (origin inherits base), Arrow: Base -> Origin.
        // if type='derived' (derived inherits origin), Arrow: Origin -> Derived.
        let source = originNodeId;
        let target = className;

        if (relationshipType === 'base' || relationshipType === 'called_by') {
          source = className; // Base or Caller
          target = originNodeId; // Origin (Derived or Callee)
        }

        // Logic moved outside the return object
        let label = relationshipType === 'base' ? 'inherits' : (relationshipType === 'called_by' ? 'calls' : relationshipType);
        let callsList = [];

        // Compute detailed calls text
        if (relationshipType === 'calls' || relationshipType === 'called_by') {
          const callerName = relationshipType === 'calls' ? originNodeId : className;
          const calleeName = relationshipType === 'calls' ? className : originNodeId;

          const callerClass = fullData[callerName];
          if (callerClass) {
            callerClass.methods?.forEach(m => {
              m.references?.forEach(r => {
                if (r === calleeName || r.startsWith(calleeName + '::')) {
                  const targetMethod = r.includes('::') ? r.split('::')[1] : calleeName;
                  callsList.push(`${m.name} -> ${targetMethod}`);
                }
              });
            });
          }

          if (callsList.length > 0) {
            label = <CallEdgeLabel calls={callsList} />;
          }
        }

        return [...prevEdges, {
          id: edgeId,
          source: source,
          target: target,
          label: label,
          data: { calls: callsList }, // Attach data for side panel
          type: 'default',
          animated: relationshipType === 'calls' || relationshipType === 'called_by',
          style: { stroke: strokeColor, strokeDasharray: strokeDash },
          markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor }
        }];
      });
    };


  };

  const addAllClasses = () => {
    if (Object.keys(fullData).length === 0) return;
    addLog(`Adding all ${Object.keys(fullData).length} classes...`);

    const allNodes = Object.values(fullData).map(cls => ({
      id: cls.name,
      data: { label: cls.name, details: cls },
      position: { x: 0, y: 0 }, // dagre will fix
      style: {
        background: '#0a0a0a',
        color: '#e0e0e0',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '12px',
        minWidth: '200px',
        fontSize: '14px',
        fontFamily: "'JetBrains Mono', monospace",
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }
    }));

    const allEdges = [];
    Object.values(fullData).forEach(cls => {
      // Add Inheritance Edges (Base -> Derived)
      if (cls.base_classes) {
        cls.base_classes.forEach(baseName => {
          // Ensure base exists
          if (fullData[baseName]) {
            const edgeId = `${baseName}-${cls.name}-inherits`;
            allEdges.push({
              id: edgeId,
              source: baseName,
              target: cls.name,
              label: 'inherits',
              type: 'default',
              markerEnd: { type: MarkerType.ArrowClosed, color: '#d19a66' },
              style: { stroke: '#d19a66' }
            });
          }
        });
      }
    });

    setNodesState(allNodes);
    setEdgesState(allEdges);

    setTimeout(() => {
      runAutoLayout();
    }, 200);
  };

  const addAllCallEdges = () => {
    if (Object.keys(fullData).length === 0) return;
    addLog("Adding all call edges...");

    const newEdges = [];
    Object.values(fullData).forEach(cls => {
      const originName = cls.name;
      // Find outgoing calls
      const calls = new Set();
      cls.methods?.forEach(m => m.references?.forEach(r => {
        if (r.includes('::')) calls.add(r.split('::')[0]);
      }));
      calls.delete(originName); // self-calls ignored

      calls.forEach(targetName => {
        if (fullData[targetName]) {
          const edgeId = `${originName}-${targetName}-calls`; // Simple ID for global add

          // Extract details for this specific pair
          const detailedCalls = [];
          cls.methods?.forEach(m => m.references?.forEach(r => {
            if (r === targetName || r.startsWith(targetName + '::')) {
              const targetMethod = r.includes('::') ? r.split('::')[1] : targetName;
              detailedCalls.push(`${m.name} -> ${targetMethod}`);
            }
          }));

          newEdges.push({
            id: edgeId,
            source: originName,
            target: targetName,
            label: detailedCalls.length > 0 ? <CallEdgeLabel calls={detailedCalls} /> : 'calls',
            data: { calls: detailedCalls }, // Attach data for side panel
            type: 'default',
            animated: true,
            style: { stroke: '#61afef', strokeDasharray: '5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#61afef' }
          });
        }
      });
    });

    setEdgesState(prev => {
      // Dedup: filter out if edge ID already exists
      const existingIds = new Set(prev.map(e => e.id));
      const distinctNew = newEdges.filter(e => !existingIds.has(e.id));
      if (distinctNew.length === 0) {
        addLog("No new call edges found.");
        return prev;
      }
      addLog(`Added ${distinctNew.length} call edges.`);
      return [...prev, ...distinctNew];
    });

    // No auto layout on edge add
    // setTimeout(() => {
    //   runAutoLayout();
    // }, 200);
  };

  const expandNeighbors = (nodeData, type, depth = 1) => {
    const origin = nodeData.name;
    addLog(`Tracing ${type} for ${origin} (Depth: ${depth})...`);

    // BFS Queue: { name: string, currentDepth: number }
    // We start looking at neighbors of 'origin' at depth 0 relative to search
    let queue = [{ name: origin, currentDepth: 0 }];
    let visited = new Set([origin]);
    const newlyAdded = [];

    while (queue.length > 0) {
      const { name, currentDepth } = queue.shift();
      if (currentDepth >= depth) continue;

      const currentData = fullData[name];
      if (!currentData) continue;

      let neighbors = [];
      if (type === 'base') neighbors = currentData.base_classes || [];
      else if (type === 'derived') neighbors = currentData.derived_classes || [];
      else if (type === 'calls') {
        // For calls, extensive recursion might be too much, but we support it if needed.
        // Currently 'calls' button doesn't have depth input, defaulting to 1 is fine or we can extend later.
        // Let's keep calls non-recursive or depth 1 for now unless requested.
        const calls = new Set();
        currentData.methods?.forEach(m => m.references?.forEach(r => {
          if (r.includes('::')) calls.add(r.split('::')[0]);
        }));
        calls.delete(currentData.name);
        neighbors = Array.from(calls);
      }
      else if (type === 'called_by') {
        const callers = new Set();
        Object.values(fullData).forEach(candidate => {
          if (candidate.name === currentData.name) return;
          candidate.methods?.forEach(m => {
            m.references?.forEach(r => {
              // Check if candidate calls current class
              if (r === currentData.name || r.startsWith(currentData.name + '::')) {
                callers.add(candidate.name);
              }
            });
          });
        });
        neighbors = Array.from(callers);
      }

      neighbors.forEach(neighborName => {
        if (!visited.has(neighborName)) {
          visited.add(neighborName);

          // Add to Graph
          // For BFS, we strictly add edges. 
          // Note: The edge direction logic is handled in addNodeToGraph via 'type'.
          // 'base' -> Arrow points Neighbor(Base) -> Current(Derived)
          // 'derived' -> Arrow points Current(Base) -> Neighbor(Derived)
          // We pass 'name' as the 'originNodeId' because that's where we found this neighbor.
          addNodeToGraph(neighborName, name, type);
          newlyAdded.push(neighborName);

          queue.push({ name: neighborName, currentDepth: currentDepth + 1 });
        }
      });
    }

    // TRIGGER RE-LAYOUT FOCUSED ON NEW NODES
    setTimeout(() => {
      runAutoLayout(newlyAdded);
    }, 100);
  };



  const fetchSourceCode = (filePath) => {
    // Logic to prepare source viewing
    // We assume selectedNodeData is the context.
    if (!selectedNodeData) {
      addLog("No class selected.");
      return;
    }

    // If source_files is missing but we have filePath from details, patch it.
    if ((!selectedNodeData.source_files || selectedNodeData.source_files.length === 0) && filePath) {
      selectedNodeData.source_files = [{ path: filePath, url: `/src/${filePath}` }];
    }

    // Reset index and open
    setActiveSourceIndex(0);
    setShowSourceModal(true);
  };


  const deleteSelectedNodes = () => {
    const selectedIds = getNodes().filter(n => n.selected).map(n => n.id);
    if (selectedIds.length === 0) return;

    setNodesState(nds => nds.filter(n => !selectedIds.includes(n.id)));
    setEdgesState(eds => eds.filter(e => !selectedIds.includes(e.source) && !selectedIds.includes(e.target)));

    if (selectedNodeData && selectedIds.includes(selectedNodeData.name)) {
      setSelectedNodeData(null);
    }
    addLog(`Deleted ${selectedIds.length} nodes.`);
  };

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeData(node.data.details);
    setSelectedEdgeData(null);
  }, []);

  const onEdgeClick = useCallback((_, edge) => {
    if (edge.data && edge.data.calls) {
      setSelectedEdgeData({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        calls: edge.data.calls
      });
      setSelectedNodeData(null);
    } else {
      setSelectedEdgeData(null);
    }
  }, []);

  const onNodesDelete = useCallback((deleted) => {
    addLog(`Deleted ${deleted.length} nodes.`);
    setEdgesState(eds => eds.filter(e => !deleted.some(n => n.id === e.source || n.id === e.target)));

    if (selectedNodeData) {
      const isSelectedDeleted = deleted.some(n => n.id === selectedNodeData.name);
      if (isSelectedDeleted) setSelectedNodeData(null);
    }
  }, [selectedNodeData, setEdgesState]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111', color: '#fff', display: 'flex', flexDirection: 'column' }}>

      {/* Tab Navigation Bar */}
      <div style={{
        height: '40px',
        background: '#1a1a1a',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            onClick={() => setActiveTab('graph')}
            style={{
              background: activeTab === 'graph' ? '#2d2d2d' : 'transparent',
              color: activeTab === 'graph' ? '#61afef' : '#888',
              border: 'none',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              borderTop: activeTab === 'graph' ? '2px solid #61afef' : '2px solid transparent'
            }}
          >
            Architecture Graph
          </button>
          <button
            onClick={() => setActiveTab('sequence')}
            style={{
              background: activeTab === 'sequence' ? '#2d2d2d' : 'transparent',
              color: activeTab === 'sequence' ? '#e06c75' : '#888',
              border: 'none',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              borderTop: activeTab === 'sequence' ? '2px solid #e06c75' : '2px solid transparent'
            }}
          >
            Sequence Flows
          </button>
          <button
            onClick={() => setActiveTab('ontology')}
            style={{
              background: activeTab === 'ontology' ? '#2d2d2d' : 'transparent',
              color: activeTab === 'ontology' ? '#c678dd' : '#888',
              border: 'none',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              borderTop: activeTab === 'ontology' ? '2px solid #c678dd' : '2px solid transparent'
            }}
          >
            Ontology Map
          </button>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#555', fontFamily: 'monospace' }}>
          HDTN Visualizer v2.1
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {/* Architecture Graph View */}
        <div style={{
          width: '100%',
          height: '100%',
          display: activeTab === 'graph' ? 'block' : 'none',
          position: 'absolute',
          top: 0,
          left: 0
        }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodesDelete={onNodesDelete}
            minZoom={0.1}
            fitView
            selectionOnDrag={true}
            panOnDrag={[2]}
            panOnScroll={false}
            zoomOnScroll={true}
            selectionKeyCode={null}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode={['Control', 'Shift', 'Meta']}
          >
            <Background color="#222" gap={20} />
            <MiniMap style={{ background: '#111', border: '1px solid #333' }} nodeColor="#444" />

            {/* Top Left Menu */}
            {/* Top Left Menu */}
            {/* Top Left Menu - Consolidated */}
            <Panel position="top-left" style={{ margin: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '400px' }}>
              <button
                onClick={() => { setShowAllClassesModal(true); setClassSearchTerm(''); }}
                className="btn-premium"
                title="Browse full list of classes"
                style={{
                  fontSize: '14px',
                  padding: '8px 12px',
                  background: '#61afef',
                  color: '#000',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              >
                Add One Class
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  onClick={addAllClasses}
                  className="btn-premium"
                  title="Add all classes in the project"
                  style={{ fontSize: '10px', padding: '4px 8px' }}
                >
                  Add All Classes
                </button>

                <button
                  onClick={addAllCallEdges}
                  className="btn-premium"
                  title="Add all call relationships to the graph"
                  style={{ fontSize: '10px', padding: '4px 8px' }}
                >
                  Add All Calls
                </button>
              </div>

              <div style={{ width: '1px', background: '#444', margin: '0 4px' }}></div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  onClick={() => { setLayoutDirection('TB'); setTimeout(() => runAutoLayout(), 50); }}
                  className="btn-premium"
                  style={{
                    fontSize: '10px',
                    padding: '4px 8px',
                    background: layoutDirection === 'TB' ? '#61afef' : '#2d2d2d',
                    color: layoutDirection === 'TB' ? '#000' : '#fff'
                  }}
                  title="Horizontal Layout (Parent -> Child grows Down)"
                >
                  Horizontal Layout
                </button>
                <button
                  onClick={() => { setLayoutDirection('LR'); setTimeout(() => runAutoLayout(), 50); }}
                  className="btn-premium"
                  style={{
                    fontSize: '10px',
                    padding: '4px 8px',
                    background: layoutDirection === 'LR' ? '#61afef' : '#2d2d2d',
                    color: layoutDirection === 'LR' ? '#000' : '#fff'
                  }}
                  title="Vertical Layout (Parent -> Child grows Right)"
                >
                  Vertical Layout
                </button>
              </div>

              <button
                onClick={() => { setNodesState([]); setEdgesState([]); }}
                className="btn-premium"
                style={{ fontSize: '12px', padding: '6px 10px', background: '#3a2c2c', borderColor: '#553333', color: '#e06c75' }}
              >
                Delete All
              </button>
            </Panel>

            {/* Logs */}
            <Panel position="bottom-left" style={{ margin: '10px' }}>
              <div style={{
                background: 'rgba(0,0,0,0.7)',
                padding: '10px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#888',
                maxWidth: '400px',
                pointerEvents: 'none'
              }}>
                {logs.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </Panel>

            {/* Details Panel */}
            {/* Details Panel */}
            {(selectedNodeData || selectedEdgeData) && (
              <Panel position="top-right" style={{
                width: '320px',
                maxHeight: '80vh',
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                margin: '20px'
              }}>
                {selectedNodeData ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h2 style={{ fontSize: '18px', margin: 0, color: '#61afef', wordBreak: 'break-all' }}>{selectedNodeData.name}</h2>
                      <button className="btn-action" onClick={() => setSelectedNodeData(null)}>X</button>
                    </div>

                    <p style={{ fontSize: '13px', color: '#999', marginBottom: '16px' }}>
                      {selectedNodeData.description || "No description available."}
                    </p>

                    {/* Add To Graph Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className="btn-premium"
                          onClick={() => expandNeighbors(selectedNodeData, 'base', baseDepth)}
                          style={{ flex: 1 }}
                        >
                          Add Base Classes
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={baseDepth}
                          onChange={(e) => setBaseDepth(parseInt(e.target.value) || 1)}
                          title="Recursion Depth"
                          style={{ width: '40px', background: '#222', border: '1px solid #333', color: '#fff', textAlign: 'center', borderRadius: '4px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className="btn-premium"
                          onClick={() => expandNeighbors(selectedNodeData, 'derived', derivedDepth)}
                          style={{ flex: 1 }}
                        >
                          Add Derived
                        </button>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={derivedDepth}
                          onChange={(e) => setDerivedDepth(parseInt(e.target.value) || 1)}
                          title="Recursion Depth"
                          style={{ width: '40px', background: '#222', border: '1px solid #333', color: '#fff', textAlign: 'center', borderRadius: '4px' }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className="btn-premium"
                          onClick={() => {
                            expandNeighbors(selectedNodeData, 'called_by', 1);
                          }}
                          style={{ flex: 1 }}
                        >
                          Add Incoming Calls
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          className="btn-premium"
                          onClick={() => {
                            expandNeighbors(selectedNodeData, 'calls', 1);
                          }}
                          style={{ flex: 1 }}
                        >
                          Add Outgoing Calls
                        </button>
                      </div>


                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <h4 style={{ borderBottom: '1px solid #333', paddingBottom: '4px', color: '#e5c07b' }}>Attributes</h4>
                      <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {selectedNodeData.attributes?.map((attr, i) => (
                          <div
                            key={i}
                            className="method-item"
                            onClick={() => {
                              setSelectedMethod({ ...attr, isAttribute: true });
                              setActiveModalTab('info');
                              fetchSourceCode(selectedNodeData.file_path);
                            }}
                            style={{
                              fontSize: '12px', padding: '4px 6px', cursor: 'pointer',
                              borderLeft: selectedMethod && selectedMethod.name === attr.name ? '2px solid #c678dd' : '2px solid transparent'
                            }}
                          >
                            <span style={{ color: '#c678dd' }}>{attr.type}</span> <span style={{ color: '#61afef' }}>{attr.name}</span>
                          </div>
                        ))}
                        {(!selectedNodeData.attributes || selectedNodeData.attributes.length === 0) && <div style={{ fontSize: '12px', color: '#666' }}>None</div>}
                      </div>
                    </div>

                    <div>
                      <h4 style={{ borderBottom: '1px solid #333', paddingBottom: '4px', color: '#98c379' }}>Methods</h4>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {/* Helper to group methods */}
                        {(() => {
                          const methods = selectedNodeData.methods || [];
                          const grouped = { public: [], protected: [], private: [] };
                          methods.forEach(m => {
                            const vis = m.visibility || 'public';
                            if (grouped[vis]) grouped[vis].push(m);
                            else grouped.public.push(m); // Fallback
                          });

                          return ['public', 'protected', 'private'].map(vis => {
                            if (grouped[vis].length === 0) return null;
                            const color = vis === 'public' ? '#98c379' : (vis === 'protected' ? '#d19a66' : '#e06c75');
                            return (
                              <div key={vis} style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#555', marginBottom: '4px', fontWeight: 'bold' }}>{vis}</div>
                                {grouped[vis].map((method, i) => (
                                  <div
                                    key={i}
                                    className="method-item"
                                    onClick={() => {
                                      setSelectedMethod(method);
                                      setActiveModalTab('info');
                                      fetchSourceCode(selectedNodeData.file_path);
                                    }}
                                    style={{
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      marginBottom: '4px',
                                      borderLeft: selectedMethod === method ? `2px solid ${color}` : '2px solid transparent',
                                      paddingLeft: '6px'
                                    }}
                                  >
                                    <span style={{ color: color }}>{method.name}</span>
                                    <span style={{ color: '#777' }}>({method.args})</span>
                                  </div>
                                ))}
                              </div>
                            );
                          });
                        })()}
                        {(!selectedNodeData.methods || selectedNodeData.methods.length === 0) && <div style={{ fontSize: '12px', color: '#666' }}>None</div>}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h2 style={{ fontSize: '16px', margin: 0, color: '#61afef' }}>Call Relationships</h2>
                      <button className="btn-action" onClick={() => setSelectedEdgeData(null)}>X</button>
                    </div>

                    <div style={{ fontSize: '12px', color: '#999', marginBottom: '12px' }}>
                      From <strong style={{ color: '#e5c07b' }}>{selectedEdgeData.source}</strong> to <strong style={{ color: '#e5c07b' }}>{selectedEdgeData.target}</strong>
                    </div>

                    <div style={{ background: '#222', borderRadius: '6px', padding: '10px' }}>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#abb2bf', borderBottom: '1px solid #333', paddingBottom: '5px' }}>
                        Method Calls ({selectedEdgeData.calls.length})
                      </h4>
                      <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                        {selectedEdgeData.calls.map((call, i) => (
                          <div key={i} style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: '#d19a66',
                            padding: '4px 8px',
                            background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                            borderRadius: '4px',
                            marginBottom: '2px'
                          }}>
                            {call}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* Duplicates removed */}
        {showAllClassesModal && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{
              background: '#1e1e1e', width: '600px', maxHeight: '80vh',
              borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #333'
            }}>
              {/* Header / Search */}
              <div style={{
                padding: '16px',
                borderBottom: '1px solid #333',
                background: '#252526',
                display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <input
                  autoFocus
                  type="text"
                  placeholder="Search classes..."
                  value={classSearchTerm}
                  onChange={(e) => setClassSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#111',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    color: '#fff',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={() => setShowAllClassesModal(false)}
                  style={{
                    background: 'transparent', border: 'none', color: '#888',
                    fontSize: '24px', cursor: 'pointer', padding: '0 8px'
                  }}
                >
                  &times;
                </button>
              </div>

              {/* List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {Object.keys(fullData).length === 0 ? (
                  <div style={{ padding: '20px', color: '#666', textAlign: 'center' }}>No classes found loaded.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px' }}>
                    {Object.keys(fullData)
                      .filter(name => !classSearchTerm || name.toLowerCase().includes(classSearchTerm.toLowerCase()))
                      .map(name => (
                        <button
                          key={name}
                          onClick={() => {
                            addNodeToGraph(name, fullData[name]);
                            setShowAllClassesModal(false);
                          }}
                          style={{
                            background: '#2d2d2d',
                            border: '1px solid #333',
                            borderRadius: '6px',
                            padding: '10px',
                            color: '#ccc',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontSize: '13px',
                            fontFamily: 'monospace',
                            transition: 'all 0.1s'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#3e3e42'; e.currentTarget.style.borderColor = '#61afef'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#2d2d2d'; e.currentTarget.style.borderColor = '#333'; }}
                        >
                          {name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Source Code Modal */}
        {showSourceModal && selectedNodeData && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', justifyContent: 'center', alignItems: 'center'
          }}>
            <div style={{
              background: '#1e1e1e', width: '90%', height: '90%',
              borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '1px solid #333'
            }}>
              {/* Header */}
              <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid #333',
                background: '#252526',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', color: '#e0e0e0' }}>
                    {selectedNodeData.name}
                    {selectedMethod ? ` :: ${selectedMethod.name}` : ''}
                  </h3>

                  {/* View Toggles */}
                  <div style={{ display: 'flex', background: '#1e1e1e', borderRadius: '4px', padding: '2px', marginLeft: '20px' }}>
                    <button
                      onClick={() => setActiveModalTab('source')}
                      style={{
                        border: 'none', background: activeModalTab === 'source' ? '#3e3e42' : 'transparent',
                        color: activeModalTab === 'source' ? '#fff' : '#888',
                        padding: '4px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer'
                      }}
                    >
                      Source Code
                    </button>
                    <button
                      onClick={() => setActiveModalTab('info')}
                      style={{
                        border: 'none', background: activeModalTab === 'info' ? '#3e3e42' : 'transparent',
                        color: activeModalTab === 'info' ? '#fff' : '#888',
                        padding: '4px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer'
                      }}
                    >
                      Component Info
                    </button>
                  </div>

                  {activeModalTab === 'source' && (
                    <div style={{ display: 'flex', gap: '4px', marginLeft: '20px' }}>
                      {selectedNodeData.source_files?.map((file, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveSourceIndex(idx)}
                          style={{
                            background: activeSourceIndex === idx ? '#007acc' : '#333',
                            color: '#fff',
                            border: 'none',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer'
                          }}
                        >
                          {file.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowSourceModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#888', fontSize: '20px', cursor: 'pointer' }}
                >
                  &times;
                </button>
              </div>

              {/* Content */}
              <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#1e1e1e' }}>
                {activeModalTab === 'source' ? (
                  loadingSource ? (
                    <div style={{ padding: '20px', color: '#888' }}>Loading source...</div>
                  ) : (
                    <pre
                      id="source-code-pre"
                      style={{
                        margin: 0,
                        padding: '16px',
                        width: '100%',
                        height: '100%',
                        overflow: 'auto',
                        fontSize: '13px',
                        fontFamily: "'JetBrains Mono', monospace",
                        lineHeight: '1.5',
                        color: '#d4d4d4'
                      }}
                    >
                      {sourceContent && sourceContent.split('\n').map((line, idx) => {
                        const lineNum = idx + 1;
                        const isHighlighted = selectedMethod && lineNum >= selectedMethod.bodystart && lineNum <= selectedMethod.bodyend;
                        return (
                          <div key={idx} style={{ background: isHighlighted ? 'rgba(97, 175, 239, 0.15)' : 'transparent', minHeight: '19.5px' }}>
                            <span style={{ display: 'inline-block', width: '40px', color: '#5c6370', userSelect: 'none', textAlign: 'right', marginRight: '15px', fontSize: '11px' }}>{lineNum}</span>
                            {line}
                          </div>
                        );
                      })}
                    </pre>
                  )
                ) : (
                  /* Component Info Tab */
                  <div style={{ padding: '24px', height: '100%', overflowY: 'auto', color: '#d4d4d4' }}>
                    {selectedMethod ? (
                      selectedMethod.isAttribute ? (
                        /* Attribute Info */
                        <>
                          <h2 style={{ fontSize: '20px', color: '#c678dd', marginBottom: '8px' }}>{selectedMethod.name}</h2>
                          <div style={{ fontSize: '14px', color: '#61afef', fontFamily: 'monospace', marginBottom: '20px' }}>
                            Attribute of {selectedNodeData.name}
                          </div>

                          <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ color: '#e5c07b', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Type Definition</h4>
                            <div style={{ background: '#252526', padding: '12px', borderRadius: '4px', fontFamily: 'monospace', color: '#d4d4d4' }}>
                              {selectedMethod.type}
                            </div>
                          </div>

                          <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ color: '#98c379', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Description</h4>
                            <p style={{ color: '#ccc' }}>
                              {selectedMethod.description || `Member variable of class ${selectedNodeData.name}.`}
                            </p>
                          </div>
                        </>
                      ) : (
                        /* Method Info */
                        <>
                          <h2 style={{ fontSize: '20px', color: '#61afef', marginBottom: '8px' }}>{selectedMethod.name}</h2>
                          <div style={{ fontSize: '14px', color: '#98c379', fontFamily: 'monospace', marginBottom: '20px' }}>
                            {selectedMethod.return_type || 'void'} {selectedMethod.name}({selectedMethod.args || '...'})
                          </div>

                          <div style={{ marginBottom: '24px' }}>
                            <h4 style={{ color: '#e5c07b', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Function Description</h4>
                            <p style={{ lineHeight: '1.6', color: '#ccc' }}>
                              {selectedMethod.description || `Inferred: responsible for ${selectedMethod.name.toLowerCase()} operations within ${selectedNodeData.name}. See HDTN Data Dictionary (TM-20240015587.pdf) for formal definition.`}
                            </p>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div>
                              <h4 style={{ color: '#c678dd', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Inputs & Outputs</h4>
                              <div style={{ marginBottom: '12px' }}>
                                <strong style={{ display: 'block', color: '#bfbfbf', marginBottom: '4px' }}>Input Parameters:</strong>
                                <div style={{ background: '#252526', padding: '8px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}>
                                  {selectedMethod.references?.length > 10 ? 'Complex (See Source)' : (selectedMethod.args || "Standard/None")}
                                </div>
                              </div>
                              <div>
                                <strong style={{ display: 'block', color: '#bfbfbf', marginBottom: '4px' }}>Return Output:</strong>
                                <div style={{ background: '#252526', padding: '8px', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace' }}>
                                  {selectedMethod.return_type || "void"}
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 style={{ color: '#56b6c2', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Usage Context</h4>
                              <strong style={{ display: 'block', color: '#bfbfbf', marginBottom: '4px' }}>Called By Modules:</strong>
                              <div style={{ background: '#252526', padding: '8px', borderRadius: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                                {(() => {
                                  // Calculate callers dynamically
                                  const callers = [];
                                  const targetRef = selectedMethod.name;

                                  Object.values(fullData).forEach(cls => {
                                    if (cls.name === selectedNodeData.name) return;
                                    cls.methods?.forEach(m => {
                                      if (m.references?.some(r => r.includes(targetRef) || r === selectedNodeData.name + '::' + targetRef)) {
                                        callers.push(`${cls.name}::${m.name}`);
                                      }
                                    });
                                  });

                                  if (callers.length === 0) return <div style={{ color: '#666', fontSize: '13px' }}>No explicit external callers found.</div>;
                                  return callers.map((c, i) => (
                                    <div key={i} style={{ fontSize: '12px', marginBottom: '2px', fontFamily: 'monospace' }}>{c}</div>
                                  ));
                                })()}
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: '24px' }}>
                            <h4 style={{ color: '#d19a66', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Outgoing Calls</h4>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                              {selectedMethod.references && selectedMethod.references.length > 0 ? (
                                selectedMethod.references.map((ref, i) => (
                                  <span key={i} style={{ background: '#333', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontFamily: 'monospace' }}>
                                    {ref}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: '#666', fontSize: '13px' }}>No outgoing calls recorded.</span>
                              )}
                            </div>
                          </div>
                        </>
                      )
                    ) : (
                      /* Class Info Fallback */
                      <>
                        <h2 style={{ fontSize: '20px', color: '#61afef', marginBottom: '8px' }}>{selectedNodeData.name}</h2>
                        <p style={{ lineHeight: '1.6', color: '#ccc', marginBottom: '24px' }}>
                          {selectedNodeData.description || "No description available."}
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                          <div>
                            <h4 style={{ color: '#e5c07b', borderBottom: '1px solid #333' }}>Base Classes</h4>
                            {selectedNodeData.base_classes?.length > 0 ? (
                              selectedNodeData.base_classes.map(b => <div key={b} style={{ fontFamily: 'monospace', padding: '4px' }}>{b}</div>)
                            ) : <div style={{ color: '#666' }}>None</div>}
                          </div>
                          <div>
                            <h4 style={{ color: '#98c379', borderBottom: '1px solid #333' }}>Detailed Metrics</h4>
                            <div style={{ fontSize: '13px', color: '#aaa' }}>
                              Methods: {selectedNodeData.methods?.length || 0}<br />
                              Attributes: {selectedNodeData.attributes?.length || 0}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* Sequence View */}
        <div style={{
          width: '100%',
          height: '100%',
          display: activeTab === 'sequence' ? 'block' : 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          background: '#0d0d0d'
        }}>
          <SequenceView />
        </div>

        {/* Ontology View */}
        <div style={{
          width: '100%',
          height: '100%',
          display: activeTab === 'ontology' ? 'block' : 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          background: '#0d0d0d'
        }}>
          <ReactFlowProvider>
            <OntologyView data={fullData} onNodeSelect={(details) => console.log("Selected Module:", details)} />
          </ReactFlowProvider>
        </div>
      </div >
    </div >
  );
};

// --- Main App Wrapper ---
const App = () => (
  <ReactFlowProvider>
    <HDTNVisualizer />
  </ReactFlowProvider>
);

export default App;
