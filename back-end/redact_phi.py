import re
import argparse
import random
from cryptography.fernet import Fernet

# extract full names from initial patient/provider lines
def extract_names(text):
    patient_match = re.search(r'(Patient|Patient name|Patient Name):\s([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})(?=\n|$)', text)
    provider_match = re.search(r'(Provider|Provider name|Provider Name):\sDr\.\s([A-Za-z]+(?:\s[A-Za-z]+)*)(?=,\sMD)', text)
    patient_name = patient_match.group(2) if patient_match else None
    provider_name = provider_match.group(2) if provider_match else None
    return patient_name, provider_name

# find all regex matches and their positions
def find_matches(text, phi_patterns):
    match_spans = set()
    matches = []
    for pattern, _ in phi_patterns:
        for match in re.finditer(pattern, text):
            span = match.span()
            if span in match_spans:
                continue  # skip duplicates by span
            match_spans.add(span)
            if match.lastindex:
                if match.lastindex == 2:
                    matches.append((span[0], match.group(2).strip()))
                else:
                    for i in range(2, match.lastindex + 1):
                        if match.group(i):
                            matches.append((span[0], match.group(i).strip()))
            else:
                matches.append((span[0], match.group(0).strip()))
    return matches

# find mentions like "Mr. Smith" or full name references
def find_name_references(text, name, title_pattern):
    references = []
    if name:
        last_name = name.split()[-1]
        full_title_pattern = title_pattern + re.escape(last_name) + r'\b'
        for match in re.finditer(full_title_pattern, text, flags=re.IGNORECASE):
            references.append((match.start(), match.group(0)))
        for match in re.finditer(r'\b' + re.escape(name) + r'\b', text, flags=re.IGNORECASE):
            references.append((match.start(), match.group(0)))
    return references

# apply substitutions for PHI
def redact_text(text, patterns):
    for pattern, replacement in patterns:
        text = re.sub(pattern, replacement, text)
    return text

# redact name and honorific references
def redact_names(text, name, title_pattern):
    if name:
        last_name = name.split()[-1]
        full_title_pattern = title_pattern + re.escape(last_name) + r'\b'
        text = re.sub(full_title_pattern, '*name*', text, flags=re.IGNORECASE)
        text = re.sub(r'\b' + re.escape(name) + r'\b', '*name*', text, flags=re.IGNORECASE)
    return text

# generate a unique id with PHI- prefix
def generate_record_id():
    return f"PHI-{random.randint(1000000000, 9999999999)}"

# encrypt a list of removed items
def encrypt_removed_items(items):
    key = Fernet.generate_key()
    cipher_suite = Fernet(key)
    joined = '\n'.join(items).encode()
    encrypted = cipher_suite.encrypt(joined)
    return key, encrypted, cipher_suite

def redact_phi(input_file, output_file):
    with open(input_file, 'r', encoding='utf-8', errors='ignore') as file:
        text = file.read()

    record_id = generate_record_id()
    text = f"{record_id}\n{text}"

    patient_name, provider_name = extract_names(text)

    # patterns must use group 2 for the sensitive value
    phi_patterns = [
        (r'(Date of Birth|DoB):\s(\d{2}/\d{2}/\d{4})', r'\1: *dob*'),
        (r'(Medical Record Number|Medical record number):\s*([\w-]+)', r'\1: *mrn*'),
        (r'(SSN|Social Security Number):\s([\d\*]{3}-[\d\*]{2}-\d{4})', r'\1: *ssn*'),
        (r'(Address:\s)([\w\s,]+,\s[A-Z]{2}\s\d{5})', r'\1*address*'),
        (r'(Fax no\.|Fax No\.):\s*\(?\d{3}\)?[-\s]?\d{3}-\d{4}', r'\1: *fax*'),
        (r'\b\(?\d{3}\)?[-\s]?\d{3}-\d{4}\b', '*phone*'),
        (r'\b[\w.-]+@[\w.-]+\.\w+\b', '*email*'),
        (r'(Health Plan Beneficiary Number|Health plan beneficiary number):\s*([\d-]+)', r'\1: *beneficiary*'),
        (r'(Device Identifier|Device identifier):\s*([\w-]+)', r'\1: *device*'),
        (r'(Pacemaker Serial Numbers|Pacemaker serial numbers):\s*([\w-]+)', r'\1: *serial*'),
        (r'(Code|code):\s*(\d+)', r'\1: *code*'),
        (r'(Hospital name|Hospital Name):\s(.+)', r'\1 *hospital*'),
        (r'(Certificate Number|Certificate number):\s*([\w-]+)', r'\1: *certificate*'),
        (r'(Health Insurance|Health insurance):\s*([\w-]+)', r'\1: *insurance*'),
        (r'(Group No\.|Group no\.):\s*(\d+)', r'\1: *group*'),
        (r'(URL|url):\s*(\S+)', r'\1: *url*'),
        (r'\b(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b', '*ip*'),
        (r'(License Number|license number):\s*([\w-]+)', r'\1: *license*'),
        (r'(?m)^-\s*Morphine.*', '*allergy*'),
        (r'(?m)^-\s*Sulfa drugs.*', '*allergy*'),
        (r'(Lab Results)(?:\s\(\d{2}\/\d{2}\/\d{4}\)):([\s\S]*)(?=Follow-up Appointment?)', r'\1: *labs*\n\n'),
        (r'(Medicaid account|Medical Account|Account):\s((?:\d{4}\s){3}\d{4})', r'\1 *account*'),
        (r'(Social worker|Social Worker):\s((?:Dr\.|Mr\.|Ms\.|Mrs\.)\s?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s?(?:,\sMD)?)(?=\n)', r'\1 *name*'),
    ]

    matches = find_matches(text, phi_patterns)
    matches += find_name_references(text, patient_name, r'\b(Mr\.|Ms\.|Mrs\.)\s*')
    matches += find_name_references(text, provider_name, r'\b(Dr\.)\s*')
    matches.sort(key=lambda x: x[0])  # sort by appearance

    removed_items = []
    seen = set()
    for _, item in matches:
        if item not in seen:
            removed_items.append(item)
            seen.add(item)

    text = redact_text(text, phi_patterns)
    text = redact_names(text, patient_name, r'\b(Mr\.|Ms\.|Mrs\.)\s*')
    text = redact_names(text, provider_name, r'\b(Dr\.)\s*')

    with open(output_file, 'w', encoding='utf-8') as file:
        file.write(text)

    print(f"Redacted file saved as {output_file}")
    print("Record ID:", record_id)

    key, encrypted, cipher_suite = encrypt_removed_items(removed_items)
    print("Encryption Key:", key.decode())
    print("Encrypted Removed Items:", encrypted.decode())

    # debug check: decrypt to verify content
    decrypted = cipher_suite.decrypt(encrypted).decode()
    print("Decrypted Removed Items (for debug):")
    print(decrypted)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Redact PHI from a text file.")
    parser.add_argument("input_file", help="Path to the input text file.")
    parser.add_argument("output_file", help="Path to save the redacted text file.")
    args = parser.parse_args()

    redact_phi(args.input_file, args.output_file)
