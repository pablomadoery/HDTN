# HDTN Visualizer Enhancements: Source Code & Knowledge Base

## Overview
We have enhanced the HDTN Architecture Visualizer to bridge the gap between high-level architecture and low-level implementation. Users can now view actual source code snippets and "AI-Inferred" descriptions for key components directly within the interactive graph.

## Key Features Added

### 1. On-Demand Source Code Viewing
- **What:** Users can view the C++ header or source file content for any selected node.
- **How:** A **"View Source"** button in the Details Panel opens a non-obtrusive modal overlay.
- **Benefits:** Allows rapid verification of implementation details without leaving the visualizer.

### 2. AI-Inferred Descriptions
- **What:** Classes with sparse Doxygen documentation now feature enhanced descriptions prefixed with `[AI Inferred]`.
- **How:** The parsing script checks a generic `KNOWLEDGE_BASE` dictionary. If a class has a short Doxygen description but exists in the Knowledge Base, the rich description is injected.
- **Benefits:** Provides context for complex HDTN components (e.g., `BpSinkAsync`, `LtpEngine`) that strictly code-based docs might miss.

### 3. Automated Data Pipeline
- **Script:** `parse_doxygen_v3.py`
- **Flow:** `Reads XML` -> `Extracts Source` -> `Injects Knowledge` -> `Saves JSON` -> `Deploys to Visualizer`.
- **Command:** Just run `python3 parse_doxygen_v3.py` to update everything.

## How to Extend

### Adding New Inferred Descriptions
Edit the `KNOWLEDGE_BASE` dictionary in `/home/madoery/Antigravity/HDTN/parse_doxygen_v3.py`:

```python
KNOWLEDGE_BASE = {
    # ... existing entries ...
    "NewComponent": "A detailed explanation of what this component does...",
}
```

### Adjusting Source Code Context
The default snippet size is set in `read_source_code` (default 20 lines) and `parse_class_xml` (default 25 lines). You can increase this in `parse_doxygen_v3.py`:

```python
# In parse_class_xml
source_snippet = read_source_code(file_path, line, context_lines=50) # Increase to 50
```

## Future Work Plan
- [ ] **Syntax Highlighting:** Integrate `prismjs` or `react-syntax-highlighter` for the source code modal.
- [ ] **Link to IDE:** Add a button to open the file directly in the user's VS Code via `vscode://` URI scheme.
- [ ] **Full File Access:** Allow toggling between "Snippet" and "Full File" view.
