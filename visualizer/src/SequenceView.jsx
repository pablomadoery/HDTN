import React, { useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: true,
    theme: 'base',
    securityLevel: 'loose',
    fontFamily: "'JetBrains Mono', monospace",
    sequence: {
        diagramMarginX: 50,
        diagramMarginY: 10,
        actorMargin: 150,
        width: 200,
        height: 65,
        boxMargin: 15,
        boxTextMargin: 10,
        noteMargin: 20,
        messageMargin: 90,
        mirrorActors: false,
        bottomMarginAdj: 10,
        useMaxWidth: false, // Critical change: Allow SVG to scale beyond internal bounds
        showSequenceNumbers: false,
    },
    themeVariables: {
        darkMode: true,
        background: '#0d0d0d',
        fontSize: '20px', // Balanced font size for full screen

        // Base Colors
        primaryColor: '#61afef',
        lineColor: '#5c6370',
        textColor: '#abb2bf',
        mainBkg: '#0d0d0d',

        // Sequence Specifics
        actorBkg: '#1e222a',
        actorBorder: '#61afef',       // Blue for Actors
        actorTextColor: '#61afef',
        actorLineColor: '#5c6370',

        signalColor: '#d19a66',       // Orange for Messages/Arrows
        signalTextColor: '#d19a66',

        labelBoxBkgColor: '#282c34',
        labelBoxBorderColor: '#5c6370',

        activationBkgColor: '#2c313a',
        activationBorderColor: '#98c379', // Green for Activity Bars

        noteBkgColor: '#1a1a1a',
        noteBorderColor: '#c678dd',   // Purple for Notes
        noteTextColor: '#c678dd',

        loopBkgColor: '#121212',
        loopTextColor: '#56b6c2',     // Cyan for Loops/Alt
        loopLineColor: '#56b6c2',

        errorBkgColor: '#e06c75',
        errorTextColor: '#fff'
    }
});

const DIAGRAMS = {
    'bpgen_to_hdtn': {
        title: 'BPGen -> Ingress',
        description: 'The process of a bundle being received by the HDTN Ingress. Ingress validates the header and then determines whether to use the high-performance Cut-Through path (direct to Egress) or the standard Store-and-Forward path (to Storage). Note that "Telemetry" represents the internal aggregation of metrics (e.g., m_bundleCountStorage) which are polled by a separate thread.',
        code: `
sequenceDiagram
    participant BpGen
    participant Ingress
    participant Storage
    participant Egress
    participant Telemetry

    Note over BpGen: Generates Bundle Payload
    BpGen->>Ingress: Send Bundle (via CLA)
    activate Ingress
    Ingress->>Ingress: Parse & Validate Header
    
    Ingress->>Ingress: Check Route & Outduct State
    
    alt Cut-Through Possible (Link Up, No Custody, Route Exists)
        Ingress->>Egress: Send Bundle Directly (ZMQ Push)
        activate Egress
        Egress-->>Ingress: Hardware/Layer ACK (Implicit)
        deactivate Egress
        Ingress->>Telemetry: Increment Egress Counters
    else Store-and-Forward (Default/Fallback)
        Ingress->>Storage: Store Bundle Data
        activate Storage
        Storage-->>Ingress: Return StorageID
        deactivate Storage
        Ingress->>Telemetry: Increment Storage Counters
    end

    Ingress-->>BpGen: ACK (ACK/NACK)
    deactivate Ingress
`
    },
    'router_scheduler': {
        title: 'Router & Scheduler Loop',
        description: 'The background process where the Router checks for unrouted bundles, queries the Contact Plan (schedule) database, and assigns an outbound duct (Outduct) for the bundle. The Router publishes "Link State" events (Up/Down) via ZMQ Pub/Sub to Ingress and Storage, which updates their internal state for Cut-Through logic.',
        code: `
sequenceDiagram
    participant Router
    participant Storage
    participant ContactPlan
    participant Ingress
    participant Telemetry

    loop Every Routing Cycle
        Router->>Storage: Poll "Unrouted Bundles"
        activate Storage
        Storage-->>Router: List of Bundle Metadata
        deactivate Storage
        
        loop For Each Bundle
            Router->>ContactPlan: Get Next Hop for Dest EID
            ContactPlan-->>Router: Return Outduct ID & Time
            
            alt Route Found
                Router->>Storage: Update Meta (Set Outduct ID)
                Router->>Telemetry: Increment Route Counters
            else No Route
                Router->>Storage: Mark "Pending Route"
                Note right of Router: Bundle waits for future Contact
            end
        end

        opt Link State Change (Schedule or Physical)
            Router->>Ingress: Publish "Link Up/Down"
            Router->>Storage: Publish "Link Up/Down"
        end
    end
`
    },
    'egress_send': {
        title: 'Egress & Transmission',
        description: 'The Egress process responsible for pulling routed bundles from storage and transmitting them to the next hop when the contact link becomes active. Note that if Cut-Through is active, Egress receives bundles directly from Ingress. Otherwise, it requests them from Storage.',
        code: `
sequenceDiagram
    participant LinkManager
    participant Egress
    participant Storage
    participant Telemetry
    participant NextHop

    LinkManager->>Egress: Signal: Link 'ToMars' is UP
    activate Egress
    
    loop While Link Active
        
        alt Store-and-Forward Mode
            Egress->>Storage: Get Bundles for 'ToMars'
            activate Storage
            Storage-->>Egress: Bundle Data Stream
            deactivate Storage
        else Cut-Through Mode
            Note over Egress: Receives directly from Ingress queue
        end

        Egress->>NextHop: Transmit (SerDes Layer)
        activate NextHop
        NextHop-->>Egress: Hardware/Layer ACK
        deactivate NextHop
        
        opt Custody Transfer
            Egress->>Storage: Delete Bundle
        end
        
        Egress->>Telemetry: Increment Bytes Transmitted
    end
    
    LinkManager->>Egress: Signal: Link 'ToMars' DOWN
    deactivate Egress
    Egress->>Telemetry: Increment Link Down Events
`
    }
};

const SequenceView = () => {
    const [activeFlow, setActiveFlow] = useState('bpgen_to_hdtn');
    const containerRef = useRef(null);

    useEffect(() => {
        // We must re-render mermaid when the content changes
        if (containerRef.current) {
            // Find the active tab content
            const element = containerRef.current.querySelector('.mermaid');
            if (element) {
                // Remove the data-processed attribute to force re-render
                element.removeAttribute('data-processed');
                // Set the text content again to ensure it's fresh
                element.innerHTML = DIAGRAMS[activeFlow].code;

                mermaid.run({
                    nodes: [element]
                }).catch(err => console.error(err));
            }
        }
    }, [activeFlow]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100vh', background: '#0d0d0d', color: '#eee', padding: '0', display: 'flex', flexDirection: 'column' }}>

            {/* Header/Controls */}
            <div style={{
                padding: '16px 24px',
                borderBottom: '1px solid #333',
                background: '#151515',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', color: '#e06c75', fontFamily: "'JetBrains Mono', monospace" }}>
                        Logic Flows
                    </h2>
                    <div style={{ width: '1px', height: '20px', background: '#444' }}></div>
                    <select
                        value={activeFlow}
                        onChange={(e) => setActiveFlow(e.target.value)}
                        style={{
                            background: '#222',
                            color: '#fff',
                            border: '1px solid #444',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            minWidth: '250px',
                            cursor: 'pointer',
                            outline: 'none',
                            fontFamily: 'inherit'
                        }}
                    >
                        {Object.entries(DIAGRAMS).map(([key, data]) => (
                            <option key={key} value={key}>{data.title}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Diagram Area */}
                <div style={{
                    flex: 1,
                    background: '#0d0d0d',
                    padding: '40px',
                    overflow: 'auto',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'flex-start'
                }}>
                    <style>{`
                        .mermaid svg { 
                            width: 100% !important; 
                            height: auto !important; 
                            max-width: none !important; 
                        }
                    `}</style>
                    <div className="mermaid" style={{ width: '100%' }}>
                        {DIAGRAMS[activeFlow].code}
                    </div>
                </div>

                {/* Info Sidebar */}
                <div style={{
                    width: '320px',
                    padding: '24px',
                    background: '#121212',
                    borderLeft: '1px solid #333',
                    overflowY: 'auto'
                }}>
                    <h3 style={{ marginTop: 0, color: '#61afef', fontSize: '16px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                        {DIAGRAMS[activeFlow].title}
                    </h3>
                    <p style={{ lineHeight: '1.6', color: '#aaa', fontSize: '14px', marginTop: '16px' }}>
                        {DIAGRAMS[activeFlow].description}
                    </p>

                    <div style={{ marginTop: '40px' }}>
                        <h4 style={{ color: '#98c379', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Participants</h4>
                        <ul style={{ paddingLeft: '20px', color: '#888', fontSize: '13px', lineHeight: '2' }}>
                            {DIAGRAMS[activeFlow].code.match(/participant\s+(\w+)/g)?.map(p => (
                                <li key={p}>{p.replace('participant ', '')}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SequenceView;
