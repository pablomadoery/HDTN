import xml.etree.ElementTree as ET
import json
import os
import glob
import re
import shutil

# --- Knowledge Base (Inferred & Manual Descriptions) ---
KNOWLEDGE_BASE = {
    "HdtnConfig": "Central configuration object for HDTN, managing node IDs, Ltp/Bp settings, and feature flags.",
    "BpSinkPattern": "Base pattern for all Bundle Protocol Sinks. Sinks are destinations for data (e.g., storage, release to app).",
    "BpSinkAsync": "A high-performance, asynchronous Sink implementation. It processes bundles in a separate thread to avoid blocking the main pipeline.",
    "BpReceiveFile": "Ingress adapter that watches a directory and initializes bundles from new files detected.",
    "BpReceivePacket": "Network-based ingress adapter. It reconstructs bundles from incoming raw packets (UDP/TCP).",
    "BpReceiveStream": "Stream-based ingress (e.g., from a pipe or socket stream) converting continuous data into discrete bundles.",
    "Egress": "The Egress subsystem manages outbound links. It schedules and transmits bundles to next-hop neighbors using convergence layers like LTP or UDP.",
    "Ingress": "The Ingress subsystem brings data into the HDTN node, supporting various adapters (File, Packet, Stream) to creating bundles.",
    "Storage": "Abstract interface for the persistent storage engine, managing how bundles are saved to and retrieved from disk.",
    "LtpEngine": "Core engine for the Licklider Transmission Protocol, handling reliable transmission over long-delay links.",
    "Scheduler": "Determines the order and timing of bundle transmission based on priority and link availability.",
    "Induct": "Handles the reception of completely formed bundles from other DTN nodes (as opposed to raw data ingress)."
}

OUTPUT_FILE = "hdtn_api_spec.json"
XML_DIR = "docs_generated/xml"
REPO_ROOT = "/home/madoery/Antigravity/HDTN"
VIZ_PUBLIC = os.path.join(REPO_ROOT, "visualizer", "public")
SOURCES_DEST = os.path.join(VIZ_PUBLIC, "sources")

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

def clean_type(type_str):
    if not type_str: return ""
    return type_str.replace('<', '&lt;').replace('>', '&gt;').strip()

def get_text_from_element(element):
    if element is None:
        return ""
    return "".join(element.itertext()).strip()

def extract_description_section(content):
    """
    Scans for Doxygen @section DESCRIPTION and returns the content.
    """
    if not content: return None
    # Look for * @section DESCRIPTION ... until * @section or */
    # This regex looks for "@section DESCRIPTION" then captures everything until the next "@" or end of comment
    match = re.search(r'@section\s+DESCRIPTION\s+(.*?)(?=\*/|@section)', content, re.DOTALL | re.IGNORECASE)
    if match:
        raw = match.group(1)
        # Clean up lines (remove * prefix)
        lines = []
        for line in raw.splitlines():
            cleaned = line.strip().lstrip('*').strip()
            if cleaned:
                lines.append(cleaned)
        return " ".join(lines).strip()
    return None

def process_source_file(rel_path):
    """
    Copies the file to visualizer/public/sources and extracts description if found.
    Returns: (public_url, extracted_description)
    """
    if not rel_path: return None, None
    
    src_abs = os.path.join(REPO_ROOT, rel_path)
    if not os.path.exists(src_abs):
        return None, None

    # Dest path mirroring structure
    # e.g. common/foo.h -> .../public/sources/common/foo.h
    dest_abs = os.path.join(SOURCES_DEST, rel_path)
    ensure_dir(os.path.dirname(dest_abs))
    
    try:
        shutil.copy2(src_abs, dest_abs)
        
        # Read for description extraction
        desc = None
        with open(src_abs, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()
            desc = extract_description_section(content)
            
        return f"/sources/{rel_path}", desc
    except Exception as e:
        print(f"Error processing {rel_path}: {e}")
        return None, None

def parse_class_xml(xml_path):
    tree = ET.parse(xml_path)
    root = tree.getroot()
    compounddef = root.find('compounddef')
    
    class_name = compounddef.find('compoundname').text
    
    # 1. Basic Doxygen Docs
    brief = get_text_from_element(compounddef.find('briefdescription'))
    detailed = get_text_from_element(compounddef.find('detaileddescription'))
    dox_description = (detailed + " " + brief).strip()
    
    # 2. Identify Source Files
    files_info = [] # List of {type: 'header'|'impl', path: '...', url: '...'}
    
    # Header
    location = compounddef.find('location')
    header_path = None
    header_desc = None
    if location is not None:
        header_path = location.get('file')
        url, desc = process_source_file(header_path)
        if url:
            files_info.append({"label": "Header (.h)", "path": header_path, "url": url, "type": "header"})
            header_desc = desc

    # Implementation (.cpp)
    # Strategy: 1. Look for bodyfile in methods. 2. Look for same name .cpp
    impl_path = None
    impl_desc = None
    
    # Check methods for bodyfile
    for section in compounddef.findall('sectiondef'):
        for member in section.findall('memberdef'):
            loc = member.find('location')
            if loc is not None:
                bf = loc.get('bodyfile')
                if bf and bf.endswith('.cpp') and bf != header_path:
                    impl_path = bf
                    break
        if impl_path: break
    
    # Fallback: simple name swap if not found
    if not impl_path and header_path and header_path.endswith('.h'):
        potential_cpp = header_path[:-2] + ".cpp"
        if os.path.exists(os.path.join(REPO_ROOT, potential_cpp)):
            impl_path = potential_cpp

    if impl_path:
        url, desc = process_source_file(impl_path)
        if url:
             files_info.append({"label": "Implementation (.cpp)", "path": impl_path, "url": url, "type": "impl"})
             impl_desc = desc
    
    # 3. Final Description Synthesis
    # Priority: @section DESCRIPTION > AI KNOWLEDGE > Doxygen Brief
    final_description = ""
    
    inferred = KNOWLEDGE_BASE.get(class_name)
    found_desc = header_desc or impl_desc
    
    if found_desc:
        final_description = found_desc
        # Append AI context if available, as a secondary note
        if inferred:
             final_description += "\n\n[AI Context]: " + inferred
    elif inferred:
        final_description = "[AI Inferred] " + inferred
        if len(dox_description) > 10:
             final_description += "\n\n(Docs): " + dox_description
    else:
        final_description = dox_description

    # Inheritance
    base_classes = []
    for base in compounddef.findall('basecompoundref'):
        if base.text: base_classes.append(base.text)
            
    # Members (simplified for graph)
    methods = []
    attributes = []
    
    for section in compounddef.findall('sectiondef'):
        kind = section.get('kind')
        
        # Parse Methods (Public, Protected, Private)
        if kind in ['public-func', 'protected-func', 'private-func']:
            visibility = kind.replace('-func', '')
            
            for member in section.findall('memberdef'):
                if member.get('kind') == 'function':
                    name = member.find('name').text
                    # Skip destructors
                    if name.startswith('~'): continue
                    
                    m_brief = get_text_from_element(member.find('briefdescription'))
                    return_type = clean_type(ET.tostring(member.find('type'), encoding='unicode', method='text'))
                    
                    # Source Location Info for Deep Linking
                    loc = member.find('location')
                    bodyfile = None
                    bodystart = None
                    bodyend = None
                    
                    if loc is not None:
                        bodyfile = loc.get('bodyfile')
                        bodystart = loc.get('bodystart')
                        bodyend = loc.get('bodyend')

                    refs = []
                    for ref in member.findall('references'):
                        if ref.text: refs.append(ref.text)

                    methods.append({
                        "name": name, 
                        "return_type": return_type,
                        "description": m_brief,
                        "references": refs,
                        "visibility": visibility,
                        "bodyfile": bodyfile,
                        "bodystart": int(bodystart) if bodystart else None,
                        "bodyend": int(bodyend) if bodyend else None
                    })

        elif 'attrib' in kind:
             for member in section.findall('memberdef'):
                 if member.get('kind') == 'variable':
                     name = member.find('name').text
                     type_str = clean_type(ET.tostring(member.find('type'), encoding='unicode', method='text'))
                     attributes.append({"name": name, "type": type_str})

    return class_name, {
        "name": class_name,
        "description": final_description,
        "base_classes": base_classes,
        "derived_classes": [], # Will be augmented
        "methods": methods,
        "attributes": attributes,
        "source_files": files_info, # New list of full files
        "file_path": header_path # Keep for compatibility
    }

def main():
    ensure_dir(SOURCES_DEST)
    
    all_classes = {}
    xml_files = glob.glob(os.path.join(XML_DIR, "class*.xml"))
    print(f"Parsing {len(xml_files)} files...")
    
    for xml_file in xml_files:
        try:
            name, data = parse_class_xml(xml_file)
            all_classes[name] = data
        except Exception as e:
            print(f"Skipping {xml_file}: {e}")

    # Compute Derived
    print("Computing derived classes...")
    for class_name, data in all_classes.items():
        for base in data['base_classes']:
            if base in all_classes:
                if class_name not in all_classes[base]['derived_classes']:
                    all_classes[base]['derived_classes'].append(class_name)

    # Save JSON locally
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(all_classes, f, indent=2)
    
    # Deploy JSON
    viz_path = os.path.join(VIZ_PUBLIC, OUTPUT_FILE)
    shutil.copy(OUTPUT_FILE, viz_path)
    print(f"Deployed API Spec to {viz_path}")
    print(f"Source files deployed to {SOURCES_DEST}")

if __name__ == "__main__":
    main()
