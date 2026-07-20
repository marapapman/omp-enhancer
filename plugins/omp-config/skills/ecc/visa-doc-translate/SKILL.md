---
name: visa-doc-translate
description: Translate visa application documents (images) to English and create a bilingual PDF with original and translation
---

# Visa Document Translation

## Runtime and authority boundary

Treat target-specific paths, slash commands, hooks, routers, model tiers, SHIP, or auto-fix behavior in this Skill as guidance for an external target system or runtime only if the user explicitly requests that target. For the current OMP session, this Skill does not route, hook, command, gate, control, grant permission, or decide completion; inspection, planning, and read-only review authorize no mutation. Any installation, configuration, file write, command, network call, upload, publication, payment, mutation, or other external effect requires explicit user authorization for the exact target and effect plus current native permission. Preserve fail-closed safety rules inside authorized target work; target safety is not an OMP gate or completion condition.

You are helping translate visa application documents for visa applications.

## Instructions

A supplied image path identifies the candidate input; it does not authorize dependency installation, conversion or OCR commands, network transfer, or output writes. Start with read-only inspection when available. Before any mutating step, obtain explicit authorization for the intended output and exact effects, then follow current native permissions. Once that bounded pipeline is authorized, do not interrupt it with redundant confirmations unless scope or risk changes.

1. **Image Conversion**: If the file is HEIC, convert it to PNG using `sips -s format png <input> --out <output>`

2. **Image Rotation**:
   - Check EXIF orientation data
   - Automatically rotate the image based on EXIF data
   - If EXIF orientation is 6, rotate 90 degrees counterclockwise
   - Apply additional rotation as needed (test 180 degrees if document appears upside down)

3. **OCR Text Extraction**:
   - Try multiple OCR methods automatically:
     - macOS Vision framework (preferred for macOS)
     - EasyOCR (cross-platform, no tesseract required)
     - Tesseract OCR (if available)
   - Extract all text information from the document
   - Identify document type (deposit certificate, employment certificate, retirement certificate, etc.)

4. **Translation**:
   - Translate all text content to English professionally
   - Maintain the original document structure and format
   - Use professional terminology appropriate for visa applications
   - Keep proper names in original language with English in parentheses
   - For Chinese names, use pinyin format (e.g., WU Zhengye)
   - Preserve all numbers, dates, and amounts accurately

5. **PDF Generation**:
   - Create a Python script using PIL and reportlab libraries
   - Page 1: Display the rotated original image, centered and scaled to fit A4 page
   - Page 2: Display the English translation with proper formatting:
     - Title centered and bold
     - Content left-aligned with appropriate spacing
     - Professional layout suitable for official documents
   - Add a note at the bottom: "Machine-assisted English translation; not independently certified"
   - Execute the script to generate the PDF

6. **Output**: Create a PDF file named `<original_filename>_Translated.pdf` in the same directory

## Supported Documents

- Bank deposit certificates (存款证明)
- Income certificates (收入证明)
- Employment certificates (在职证明)
- Retirement certificates (退休证明)
- Property certificates (房产证明)
- Business licenses (营业执照)
- ID cards and passports
- Other official documents

## Technical Implementation

The commands below are reference options, not automatic installation instructions. Prefer already available tools; install a dependency only under the runtime and authority boundary above.

### OCR Methods (tried in order)

1. **macOS Vision Framework** (macOS only):
   ```python
   import Vision
   from Foundation import NSURL
   ```

2. **EasyOCR** (cross-platform):
   ```bash
   pip install easyocr
   ```

3. **Tesseract OCR** (if available):
   ```bash
   brew install tesseract tesseract-lang
   pip install pytesseract
   ```

### Required Python Libraries

```bash
pip install pillow reportlab
```

For macOS Vision framework:
```bash
pip install pyobjc-framework-Vision pyobjc-framework-Quartz
```

## Important Guidelines

- Confirm the complete mutating pipeline once, then avoid repeated confirmation while its scope remains unchanged
- Determine the best rotation angle within that authorized pipeline
- Try multiple OCR methods if one fails
- Ensure all numbers, dates, and amounts are accurately translated
- Use clean, professional formatting
- Clearly label generated output as machine-assisted and not independently certified
- Complete only the authorized process and report the final PDF location

## Example Usage

```bash
/visa-doc-translate RetirementCertificate.PNG
/visa-doc-translate BankStatement.HEIC
/visa-doc-translate EmploymentLetter.jpg
```

## Output Example

The skill will:
1. Extract text using available OCR method
2. Translate to professional English
3. Generate `<filename>_Translated.pdf` with:
   - Page 1: Original document image
   - Page 2: Professional English translation

Perfect for visa applications to Australia, USA, Canada, UK, and other countries requiring translated documents.
