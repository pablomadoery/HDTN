import xml.etree.ElementTree as ET
import os
import json
import re

def parse_index(index_path):
    """
    Parses index.xml to get a mapping of class names to their XML file paths.
    """
    tree = ET.parse(index_path)
    root = tree.getroot()
    classes = {}
    for compound in root.findall('compound'):
        if compound.get('kind') == 'class' or compound.get('kind') == 'struct':
            name = compound.find('name').text
            refid = compound.get('refid')
            classes[name] = f"{refid}.xml"
    return classes

def clean_type(type_str):
    """
    Cleans up C++ type strings for easier processing.
    """
    if not type_str:
        return ""
    # Remove XML tags if any (Doxygen sometimes puts <ref> tags inside type)
    # This simple regex removes all <...> tags.
    type_str = re.sub(r'<[^>]+>', '', type_str)
    return type_str.strip()

def parse_class_xml(xml_path):
    """
    Parses a class XML file to extract methods, fields, and relationships.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()
    compounddef = root.find('compounddef')
    
    class_name = compounddef.find('compoundname').text
    
    # Inheritance
    base_classes = []
    for base in compounddef.findall('basecompoundref'):
        if base.text:
            base_classes.append(base.text)
            
    derived_classes = []
    for derived in compounddef.findall('derivedcompoundref'):
        if derived.text:
            derived_classes.append(derived.text)

    methods = []
    
    for section in compounddef.findall('sectiondef'):
        # We are primarily interested in public functions
        if section.get('kind') == 'public-func':
            for member in section.findall('memberdef'):
                if member.get('kind') == 'function':
                    name = member.find('name').text
                    
                    # Skip destructors
                    if name.startswith('~'):
                        continue
                        
                    return_type = clean_type(ET.tostring(member.find('type'), encoding='unicode', method='text'))
                    
                    args = []
                    for param in member.findall('param'):
                        arg_type_elem = param.find('type')
                        arg_type = clean_type(ET.tostring(arg_type_elem, encoding='unicode', method='text')) if arg_type_elem is not None else ""
                        declname_elem = param.find('declname')
                        arg_name = declname_elem.text if declname_elem is not None else ""
                        args.append({'type': arg_type, 'name': arg_name})
                    
                    # Call Graph Relationships
                    references = []
                    for ref in member.findall('references'):
                        if ref.text:
                            references.append(ref.text)
                            
                    referenced_by = []
                    for ref in member.findall('referencedby'):
                        if ref.text:
                            referenced_by.append(ref.text)

                    # Protection against operators for now (unless we want to map them later)
                    if 'operator' in name:
                        continue
                        
                    methods.append({
                        'name': name,
                        'return_type': return_type,
                        'args': args,
                        'is_static': member.get('static') == 'yes',
                        'is_const': member.get('const') == 'yes',
                        'references': references,
                        'referenced_by': referenced_by
                    })

    return {
        'name': class_name,
        'base_classes': base_classes,
        'derived_classes': derived_classes,
        'methods': methods
    }

def main():
    xml_dir = "/home/madoery/Antigravity/HDTN/docs_generated/xml"
    index_path = os.path.join(xml_dir, "index.xml")
    
    if not os.path.exists(index_path):
        print(f"Error: {index_path} not found.")
        return

    classes_map = parse_index(index_path)
    parsed_data = {}

    print(f"Found {len(classes_map)} classes in index.")

    for class_name, filename in classes_map.items():
        # Optional: Filter for specific namespace or classes if needed
        # For now, let's try to grab everything found, or maybe just 'HdtnConfig' and related configuration classes as a start?
        # Let's grab everything, and we can filter purely based on naming convention or user request later.
        # Actually, processing ALL might be too much for a demo, but let's try.
        
        file_path = os.path.join(xml_dir, filename)
        if os.path.exists(file_path):
            try:
                class_info = parse_class_xml(file_path)
                parsed_data[class_name] = class_info
            except Exception as e:
                print(f"Failed to parse {class_name}: {e}")
    
    output_path = "hdtn_api_spec.json"
    with open(output_path, 'w') as f:
        json.dump(parsed_data, f, indent=4)
    
    print(f"Successfully parsed {len(parsed_data)} classes. Output saved to {output_path}")

if __name__ == "__main__":
    main()
