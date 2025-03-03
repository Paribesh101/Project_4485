import re
import argparse

def redact_phi(input_file, output_file):
    # Define PHI patterns and the replacements
    phi_patterns = {
        r'(?<=Patient:\s)\w+(\s\w+){1,2}': '*name*',  # Name (First, last, optional middle)
        r'(?<=Date of Birth:\s)\d{2}/\d{2}/\d{4}': '*dob*',  # Date of birth
        r'(?<=Address:\s)([\w\s,]+,\s[A-Z]{2}\s\d{5})': '*address*',  # Address
        r'\b\(?\d{3}\)?[-\s]?\d{3}-\d{4}\b': '*phone*',  # Phone number (parentheses optional)
        r'\b[\w.-]+@[\w.-]+\.\w+\b': '*email*',  # Email address
        r'\b\d{3}-\d{2}-\d{4}\b': '*ssn*',  # Social Security Number
    }
    
    with open(input_file, 'r', encoding='utf-8') as file:   # Read input medical record file
        text = file.read()
    
    for pattern, replacement in phi_patterns.items():       # Apply regex substitutions
        text = re.sub(pattern, replacement, text)
    
    with open(output_file, 'w', encoding='utf-8') as file:  # Write redactions to output file
        file.write(text)
    
    print(f"Redacted file saved as {output_file}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Redact PHI from a medical record.")
    parser.add_argument("input_file", help="Path to the input medical record file.")
    parser.add_argument("output_file", help="Path to save the redacted medical record file.")
    args = parser.parse_args()
    
    redact_phi(args.input_file, args.output_file)