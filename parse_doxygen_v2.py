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
    type_str = re.sub(r'<[^>]+>', '', type_str)
    return type_str.strip()

def get_text_from_element(element):
    """
    Recursively extracts text from an XML element (e.g., description).
    """
    if element is None:
        return ""
    text = element.text or ""
    for child in element:
        text += get_text_from_element(child)
        if child.tail:
            text += child.tail
    return text.strip()

def parse_class_xml(xml_path):
    """
    Parses a class XML file to extract methods, fields, relationships, and documentation.
    """
    tree = ET.parse(xml_path)
    root = tree.getroot()
    compounddef = root.find('compounddef')
    
    class_name = compounddef.find('compoundname').text
    
    # Documentation
    brief_desc = get_text_from_element(compounddef.find('briefdescription'))
    detailed_desc = get_text_from_element(compounddef.find('detaileddescription'))
    
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
    attributes = []
    
    for section in compounddef.findall('sectiondef'):
        kind = section.get('kind')
        
        # Methods
        if kind == 'public-func':
            for member in section.findall('memberdef'):
                if member.get('kind') == 'function':
                    name = member.find('name').text
                    
                    if name.startswith('~'): continue # Skip destructors
                        
                    return_type = clean_type(ET.tostring(member.find('type'), encoding='unicode', method='text'))
                    
                    args = []
                    for param in member.findall('param'):
                        arg_type_elem = param.find('type')
                        arg_type = clean_type(ET.tostring(arg_type_elem, encoding='unicode', method='text')) if arg_type_elem is not None else ""
                        declname_elem = param.find('declname')
                        arg_name = declname_elem.text if declname_elem is not None else ""
                        args.append({'type': arg_type, 'name': arg_name})
                    
                    # Call Graph
                    references = [ref.text for ref in member.findall('references') if ref.text]
                    referenced_by = [ref.text for ref in member.findall('referencedby') if ref.text]

                    if 'operator' in name: continue
                        
                    methods.append({
                        'name': name,
                        'return_type': return_type,
                        'args': args,
                        'references': references,
                        'brief': get_text_from_element(member.find('briefdescription'))
                    })

        # Attributes (Member Variables)
        elif kind == 'public-attrib':
            for member in section.findall('memberdef'):
                if member.get('kind') == 'variable':
                    name = member.find('name').text
                    type_str = clean_type(ET.tostring(member.find('type'), encoding='unicode', method='text'))
                    attributes.append({
                        'name': name,
                        'type': type_str,
                        'brief': get_text_from_element(member.find('briefdescription'))
                    })

    return {
        'name': class_name,
        'description': detailed_desc or brief_desc,
        'base_classes': base_classes,
        'derived_classes': derived_classes,
        'methods': methods,
        'attributes': attributes
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
