# Redact Protected Health Information (PHI)

## Description

This script redacts PHI from an input text file. It replaces sensitive data such as names, addresses, phone numbers, emails, dates of birth, and SSN with predefined tags.

## Requirements

- Python 3.x

## Installation

1. Clone the repository:
   ```bash
   git clone <repository_url>
   cd <repository_name>
   ```
2. Ensure Python is installed on your system.

## Usage

Run the script from the terminal:

```bash
python redact_phi.py <input_file> <output_file>
```

Example:

```bash
python redact_phi.py ehrJMS.txt redacted_ehr.txt
```

## Redacted Fields

- **Name** → `*name*`
- **Date of Birth** → `*dob*`
- **Address** → `*address*`
- **Phone Number** → `*phone*`
- **Email Address** → `*email*`
- **SSN** → `*ssn*`

## License

This project is licensed under the MIT License.