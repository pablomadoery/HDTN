const fs = require('fs');
const path = require('path');

const API_SPEC_PATH = 'public/hdtn_api_spec.json';
const DATA_DICT_PATH = '../doc/TM-20240015587.txt';

// Simple heuristic inference based on class names
function inferDescription(name) {
    if (name.includes('Queue')) return `Handles queuing mechanisms for ${name.replace('Queue', '')}.`;
    if (name.includes('Manager')) return `Manages the lifecycle and operations of ${name.replace('Manager', '')}.`;
    if (name.includes('Outduct')) return `Implements an Outduct strategy for ${name.replace('Outduct', '')}.`;
    if (name.includes('Induct')) return `Implements an Induct strategy for ${name.replace('Induct', '')}.`;
    if (name.includes('Cmd')) return `Handles command processing for ${name.replace('Cmd', '')}.`;
    if (name.includes('Config')) return `Configuration holder for ${name.replace('Config', '')}.`;
    return `Class providing functionality for ${name}.`;
}

function inferMethodDescription(className, methodName) {
    const lower = methodName.toLowerCase();
    if (lower === 'run') return `Executes the main operational loop for ${className}.`;
    if (lower === 'init' || lower === 'initialize') return `Initializes the ${className} instance and its dependencies.`;
    if (lower === 'stop' || lower === 'shutdown') return `Terminates the operations of ${className} and releases resources.`;
    if (lower.startsWith('get')) return `Retrieves the value of ${methodName.substring(3)} from ${className}.`;
    if (lower.startsWith('set')) return `Sets the value of ${methodName.substring(3)} in ${className}.`;
    if (lower.startsWith('push')) return `Adds a new item to the ${className} structure.`;
    if (lower.startsWith('pop')) return `Removes and returns an item from the ${className} structure.`;
    if (lower === 'clear') return `Clears all data from ${className}.`;
    if (lower.includes('callback')) return `Callback handler for events in ${className}.`;
    return `Performs the ${methodName} operation for ${className}.`;
}

try {
    const rawData = fs.readFileSync(API_SPEC_PATH, 'utf8');
    const data = JSON.parse(rawData);

    // Load Data Dictionary Text
    let dictLines = [];
    try {
        const dictRaw = fs.readFileSync(DATA_DICT_PATH, 'utf8');
        dictLines = dictRaw.split('\n');
        console.log(`Loaded Data Dictionary (${dictLines.length} lines)`);
    } catch (e) {
        console.warn("Could not load Data Dictionary text, skipping PDF-based inference:", e.message);
    }

    let updatedCount = 0;

    Object.keys(data).forEach(key => {
        const cls = data[key];

        // Update Class Description
        if (!cls.description || cls.description.trim() === '') {
            let inferred = inferDescription(cls.name);

            // Hardcoded "Smarter" inferences for known specific classes
            if (cls.name === 'DtnFrameQueue') {
                inferred = "Thread-safe queue for managing RTP frames (dtov/streaming) with mutex synchronization and size tracking.";
            } else if (cls.name === 'GStreamerAppSrcOutduct') {
                inferred = "Outduct that interfaces with GStreamer's AppSrc to stream received bundles as multimedia data.";
            }

            cls.description = `[Inferred] ${inferred}`;
            updatedCount++;
            console.log(`Updated description for ${cls.name}`);
        }

        // Update Method Descriptions
        if (cls.methods) {
            cls.methods.forEach(method => {
                if (!method.description || method.description.trim() === '') {
                    method.description = `[Inferred] ${inferMethodDescription(cls.name, method.name)}`;
                    updatedCount++;
                    console.log(`Updated description for method ${cls.name}.${method.name}`);
                }
            });
        }

        // Update Attribute Descriptions
        if (cls.attributes) {
            cls.attributes.forEach(attr => {
                if (!attr.description || attr.description.trim() === '') {
                    // 1. Try to find in Data Dictionary
                    let foundDesc = null;
                    if (dictLines.length > 0) {
                        // Look for line starting with attribute name
                        // Allow for some leading whitespace characters
                        const regex = new RegExp(`^\\s*${attr.name}\\s+(.*)`);
                        for (const line of dictLines) {
                            const match = line.match(regex);
                            if (match) {
                                // Extract the description column (assuming at least 2 spaces separator)
                                const parts = match[1].split(/\s{2,}/);
                                if (parts.length > 0) {
                                    // Sometimes description is the first part, sometimes mnemonic is very long
                                    // Usually: Mnemonic [spaces] Description [spaces] Type
                                    // The regex match[1] captures everything AFTER the name and the first space gap.
                                    // Actually, let's just split the whole line including the name.
                                    // Re-split the whole line by 2+ spaces.
                                    const cols = line.trim().split(/\s{2,}/);
                                    // Index 0: Mnemonic
                                    // Index 1: Description
                                    if (cols.length >= 2 && cols[0] === attr.name) {
                                        foundDesc = cols[1];
                                        // Fix for cases where description wraps? We'll ignore multi-line for now for simplicity.
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    if (foundDesc) {
                        attr.description = `[Doc] ${foundDesc}`;
                        updatedCount++;
                        console.log(`Matched attribute ${cls.name}::${attr.name} -> ${foundDesc}`);
                    } else {
                        // 2. Infer from content
                        let inferred = `Member variable ${attr.name}`;
                        if (attr.name.startsWith('m_')) {
                            const core = attr.name.substring(2);
                            inferred = `Holds the ${core} value.`;
                        }
                        attr.description = `[Inferred] ${inferred}`;
                        updatedCount++;
                    }
                }
            });
        }
    });

    if (updatedCount > 0) {
        fs.writeFileSync(API_SPEC_PATH, JSON.stringify(data, null, 2));
        console.log(`Successfully updated ${updatedCount} descriptions in ${API_SPEC_PATH}`);
    } else {
        console.log("No descriptions needed updating.");
    }

} catch (e) {
    console.error("Error updating descriptions:", e);
}
