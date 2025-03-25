import re
import argparse

def redact_phi(input_file, output_file):
    # Read input file
    with open(input_file, 'r', encoding='utf-8', errors='ignore') as file:
        text = file.read()
    
    # Extract patient and provider names
    patient_match = re.search(r'(?<=Patient:\s)[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}(?=\n|$)', text)
    provider_match = re.search(r'(?<=Provider:\sDr\.\s)([A-Za-z]+(\s[A-Za-z]+)*)(?=,\sMD)', text)
    patient_name_match = re.search(r'(?<=Patient name:\s)[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}(?=\n|$)', text)
    provider_name_match = re.search(r'(?<=Provider name:\sDr\.\s)([A-Za-z]+(\s[A-Za-z]+)*)(?=,\sMD)', text)

    patient_name = (patient_name_match or patient_match)
    patient_name = patient_name.group(0) if patient_name else None

    provider_name = (provider_name_match or provider_match)
    provider_name = provider_name.group(1) if provider_name else None
    
    # Define PHI patterns and replacements
    phi_patterns = {
        r'(?<=Patient:\s)[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}(?=\n|$)': '*name*',  # Name (First, last, optional middle)
        r'(?<=Patient name:\s)[A-Z][a-z]+(\s[A-Z][a-z]+){1,2}(?=\n|$)': '*name*',  # Name (First, last, optional middle), long label
        r'(?<=Date of Birth:\s)\d{2}/\d{2}/\d{4}': '*dob*',  # Date of birth
        r'(?<=DoB:\s)\d{2}/\d{2}/\d{4}': '*dob*',  # DoB
        r'(?<=Medical Record Number:\s)\d+': '*mrn*', # Medical record number
        r'\b[\d\*]{3}-[\d\*]{2}-\d{4}\b': '*ssn*',  # SSN allowing * in any of the first 5 digits
        r'(?<=Address:\s)([\w\s,]+,\s[A-Z]{2}\s\d{5})': '*address*',  # Address
        r'\b\(?\d{3}\)?[-\s]?\d{3}-\d{4}\b': '*phone*',  # Phone number (parentheses optional)
        r'\b[\w.-]+@[\w.-]+\.\w+\b': '*email*',  # Email address
        r'(SSN|Social Security Number):\s(?:[\d\*]{3}-[\d\*]{2}-\d{4})': r'\1: *ssn*',  # SSN line (keep label)
        r'(?<=Provider:\s)Dr\.\s[\w\s]+,\sMD': '*name*',  # Doctor's Name
        r'(?<=Provider name:\s)Dr\.\s[\w\s]+,\sMD': '*name*',  # Doctor's name, long label
        r'Hospital name:\s.+': 'Hospital name: *hospital*',  # Hospital name
        r'Allergies:\n(?:- .+\n)+': 'Allergies:\n*allergies*\n',  # Allergies block
        r'Lab Results \(\d{2}/\d{2}/\d{4}\):\n(?:- .+\n)+': 'Lab Results: \n*labs*\n',  # Lab results block with date
        r'Medicaid account:\s(?:\d{4}\s){3}\d{4}': 'Medicaid account: *account*',  # Medicaid account number
        r'Social worker:\s(?:Dr\.|Mr\.|Ms\.|Mrs\.)?\s?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s?(?:,\sMD)?': 'Social worker: *name*',  # Social worker name
    }
    
    # Apply regex substitutions
    for pattern, replacement in phi_patterns.items():
        text = re.sub(pattern, replacement, text)
    
    # Remove additional references to the patient and provider names
    if patient_name:
        last_name = patient_name.split()[-1]
        text = re.sub(r'\b(Mr\.|Ms\.|Mrs\.)?\s*' + re.escape(last_name) + r'\b', '*name*', text, flags=re.IGNORECASE)  # Remove last name and title
        text = re.sub(r'\b' + re.escape(patient_name) + r'\b', '*name*', text, flags=re.IGNORECASE)  # Remove full patient name anywhere
    if provider_name:
        last_name = provider_name.split()[-1]
        text = re.sub(r'\bDr\.?\s*' + re.escape(last_name) + r'\b', '*name*', text, flags=re.IGNORECASE)  # Remove last name with Dr. prefix
        text = re.sub(r'\b' + re.escape(provider_name) + r'\b', '*name*', text, flags=re.IGNORECASE)  # Remove full provider name anywhere
    
    # Write redacted content to output file
    with open(output_file, 'w', encoding='utf-8') as file:
        file.write(text)
    
    print(f"Redacted file saved as {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Redact PHI from a text file.")
    parser.add_argument("input_file", help="Path to the input text file.")
    parser.add_argument("output_file", help="Path to save the redacted text file.")
    args = parser.parse_args()
    
    redact_phi(args.input_file, args.output_file)