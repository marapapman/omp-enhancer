---
name: nutrient-document-processing
description: Process, convert, OCR, extract, redact, sign, and fill documents using the Nutrient DWS API. Works with PDFs, DOCX, XLSX, PPTX, HTML, and images.
origin: ECC
---

# Nutrient Document Processing

## Runtime and authority boundary

Treat target-specific paths, slash commands, hooks, routers, model tiers, SHIP, or auto-fix behavior in this Skill as guidance for an external target system or runtime only if the user explicitly requests that target. For the current OMP session, this Skill does not route, hook, command, gate, control, grant permission, or decide completion; inspection, planning, and read-only review authorize no mutation. Any installation, configuration, file write, command, network call, upload, publication, payment, mutation, or other external effect requires explicit user authorization for the exact target and effect plus current native permission. Preserve fail-closed safety rules inside authorized target work; target safety is not an OMP gate or completion condition.

> **Note:** This skill integrates with the Nutrient commercial API. Review their terms before use.

Process documents with the [Nutrient DWS Processor API](https://www.nutrient.io/api/). Convert formats, extract text and tables, OCR scanned documents, redact PII, add watermarks, digitally sign, and fill PDF forms.

## Data, credential, and signing boundary

A request for inspection or local planning does not authorize an upload to Nutrient or another third party. Name the exact documents, service, purpose, and output before transfer; minimize the payload and redact locally when practical. Treat the API key as a secret: never print, log, expose, or place it in generated examples or reports. A digital signature requires explicit confirmation of the document, signer identity, signing authority, and intended effect; do not represent an example or self-signed result as independently verified or legally sufficient.

## Setup

Get a free API key at **[nutrient.io](https://dashboard.nutrient.io/sign_up/?product=processor)**

```bash
export NUTRIENT_API_KEY="pdf_live_..."
```

All requests go to `https://api.nutrient.io/build` as multipart POST with an `instructions` JSON field.

## Operations

### Convert Documents

```bash
# DOCX to PDF
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.docx=@document.docx" \
  -F 'instructions={"parts":[{"file":"document.docx"}]}' \
  -o output.pdf

# PDF to DOCX
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"output":{"type":"docx"}}' \
  -o output.docx

# HTML to PDF
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "index.html=@index.html" \
  -F 'instructions={"parts":[{"html":"index.html"}]}' \
  -o output.pdf
```

Supported inputs: PDF, DOCX, XLSX, PPTX, DOC, XLS, PPT, PPS, PPSX, ODT, RTF, HTML, JPG, PNG, TIFF, HEIC, GIF, WebP, SVG, TGA, EPS.

### Extract Text and Data

```bash
# Extract plain text
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"output":{"type":"text"}}' \
  -o output.txt

# Extract tables as Excel
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"output":{"type":"xlsx"}}' \
  -o tables.xlsx
```

### OCR Scanned Documents

```bash
# OCR to searchable PDF (supports 100+ languages)
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "scanned.pdf=@scanned.pdf" \
  -F 'instructions={"parts":[{"file":"scanned.pdf"}],"actions":[{"type":"ocr","language":"english"}]}' \
  -o searchable.pdf
```

Languages: Supports 100+ languages via ISO 639-2 codes (e.g., `eng`, `deu`, `fra`, `spa`, `jpn`, `kor`, `chi_sim`, `chi_tra`, `ara`, `hin`, `rus`). Full language names like `english` or `german` also work. See the [complete OCR language table](https://www.nutrient.io/guides/document-engine/ocr/language-support/) for all supported codes.

### Redact Sensitive Information

```bash
# Pattern-based (SSN, email)
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"actions":[{"type":"redaction","strategy":"preset","strategyOptions":{"preset":"social-security-number"}},{"type":"redaction","strategy":"preset","strategyOptions":{"preset":"email-address"}}]}' \
  -o redacted.pdf

# Regex-based
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"actions":[{"type":"redaction","strategy":"regex","strategyOptions":{"regex":"\\b[A-Z]{2}\\d{6}\\b"}}]}' \
  -o redacted.pdf
```

Presets: `social-security-number`, `email-address`, `credit-card-number`, `international-phone-number`, `north-american-phone-number`, `date`, `time`, `url`, `ipv4`, `ipv6`, `mac-address`, `us-zip-code`, `vin`.

### Add Watermarks

```bash
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"actions":[{"type":"watermark","text":"CONFIDENTIAL","fontSize":72,"opacity":0.3,"rotation":-45}]}' \
  -o watermarked.pdf
```

### Digital Signatures

Do not run this operation until the user has confirmed the exact document, signer, signing authority, and destination under the boundary above.

```bash
# Self-signed CMS signature
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "document.pdf=@document.pdf" \
  -F 'instructions={"parts":[{"file":"document.pdf"}],"actions":[{"type":"sign","signatureType":"cms"}]}' \
  -o signed.pdf
```

### Fill PDF Forms

```bash
curl -X POST https://api.nutrient.io/build \
  -H "Authorization: Bearer $NUTRIENT_API_KEY" \
  -F "form.pdf=@form.pdf" \
  -F 'instructions={"parts":[{"file":"form.pdf"}],"actions":[{"type":"fillForm","formFields":{"name":"Jane Smith","email":"jane@example.com","date":"2026-02-06"}}]}' \
  -o filled.pdf
```

## MCP Server (Alternative)

For native tool integration, use the MCP server instead of curl:

```json
{
  "mcpServers": {
    "nutrient-dws": {
      "command": "npx",
      "args": ["-y", "@nutrient-sdk/dws-mcp-server"],
      "env": {
        "NUTRIENT_DWS_API_KEY": "YOUR_API_KEY",
        "SANDBOX_PATH": "/path/to/working/directory"
      }
    }
  }
}
```

## When to Use

- Converting documents between formats (PDF, DOCX, XLSX, PPTX, HTML, images)
- Extracting text, tables, or key-value pairs from PDFs
- OCR on scanned documents or images
- Redacting PII before sharing documents
- Adding watermarks to drafts or confidential documents
- Digitally signing contracts or agreements
- Filling PDF forms programmatically

## Links

- [API Playground](https://dashboard.nutrient.io/processor-api/playground/)
- [Full API Docs](https://www.nutrient.io/guides/dws-processor/)
- [npm MCP Server](https://www.npmjs.com/package/@nutrient-sdk/dws-mcp-server)
