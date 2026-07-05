# PDF Text Extraction Using Google Translate's OCR and Selenium

Extracting text from PDF files sounds trivial — until the PDF is a scanned book where every page is a raster image with no underlying Unicode text. Standard parsing libraries like `pdfplumber` and `PyMuPDF` return empty strings in this case. Tesseract can fill the gap for Latin scripts, but for Arabic, Persian, Chinese, or other complex scripts, accuracy drops significantly without careful training data and configuration.

This post walks through **[GoogleTranslateOCRExtractTextFromPDF](https://github.com/v3xlrm1nOwo1/GoogleTranslateOCRExtractTextFromPDF)** — a Python tool that converts PDF pages to images, uploads them to Google Translate's image translation mode, and uses Selenium to extract the OCR-recognized text page by page into a plain-text file. The same tool also optionally translates the extracted text into any target language supported by Google Translate.

## Why Google Translate's OCR?

Google Translate has an **Image** mode (accessible at `translate.google.com` under `op=images`) that accepts an uploaded image and returns recognized text in the source language or a translation in the target language. Under the hood it uses Google's production OCR engine — the same engine that powers Google Lens — which is trained on a far larger and more diverse corpus than Tesseract.

![Selenium WebDriver logo](https://upload.wikimedia.org/wikipedia/commons/d/d5/Selenium_Logo.png "600x300 Selenium WebDriver is used to automate the Chrome browser — uploading each page image to Google Translate and reading back the recognized text")

For Arabic and Persian literary texts in particular (the use-case that motivated this project), Google's OCR significantly outperforms Tesseract without any additional model training or language pack setup.

## The Three-Stage Pipeline

### Stage 1 — PDF to Images

The `pdf2image` library wraps the Poppler `pdftoppm` utility to rasterize each PDF page into a high-resolution PNG:

```python
from pdf2image import convert_from_path

images = convert_from_path(
    pdf_path,
    first_page=start_page,
    last_page=end_page
)
```

Each page is written to disk as `page_<number>.png` inside a `<pdf_name>/Images/` directory. Saving pages to disk first — rather than keeping them in memory — allows the tool to resume interrupted runs cleanly.

### Stage 2 — OCR via Selenium

A Chrome browser is launched with automation-detection flags disabled, preventing Google from blocking the session:

```python
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

options = Options()
options.add_experimental_option("excludeSwitches", ["enable-automation"])
options.add_experimental_option('useAutomationExtension', False)
options.add_argument("remote-debugging-port=9222")

driver = webdriver.Chrome(options=options)
```

The browser navigates to Google Translate's image mode with the source and target language baked into the URL:

```python
url = f"https://translate.google.com/?sl={source_lang}&tl={target_lang}&op=images"
driver.get(url)
```

For each page image, the script uploads the file through the browser's file input, waits for the OCR result to appear in the DOM using `WebDriverWait`, and reads the recognized text from the appropriate element.

### Stage 3 — Text to File

Extracted text is appended to a `.txt` file one page at a time, formatted with a clear page header:

```
        Page Number: [15]

 The extracted content for this page appears here,
 preserving line breaks from the original scan...
```

This format makes it straightforward to split the output back into individual pages or search for specific page numbers after the run completes.

## Installation

Clone the repository and install the three dependencies:

```bash
pip install -r requirements.txt
```

`requirements.txt`:

```
tqdm==4.66.1
selenium==4.18.1
pdf2image==1.17.0
```

`pdf2image` requires **Poppler** to be installed separately. On Linux/macOS:

```bash
# Debian/Ubuntu
sudo apt install poppler-utils

# macOS with Homebrew
brew install poppler
```

On Windows, download the Poppler binaries and add the `bin/` folder to your system PATH. A detailed guide for each OS is linked from the repository: [stackoverflow.com/questions/53481088](https://stackoverflow.com/questions/53481088/poppler-in-path-for-pdf2image).

## Arguments Reference

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--pdf_path` | str | — | Path to the PDF file |
| `--start_page` | int | — | First page to process (1-indexed) |
| `--end_page` | int | — | Last page to process |
| `--source_lang` | str | `auto` | Source language code (`auto` for detection) |
| `--target_lang` | str | — | Target language code (e.g. `ar`, `en`, `es`) |
| `--cleaning_text` | bool | `False` | Strip `_`, `-`, and stray digits from output |
| `--action` | str | `continue` | `continue` to resume, `clear` to restart |

## Usage

The repository includes a sample Arabic-language PDF: *Ruba'iyat of Mawlana Jalal al-Din al-Rumi* (`رباعيات مولانا جلال الدين الرومي.pdf`). To extract pages 10 through 92 in Arabic:

```bash
python main.py --pdf_path "Books/رباعيات مولانا جلال الدين الرومي.pdf" \
               --start_page 10 \
               --end_page 92 \
               --source_lang auto \
               --target_lang ar \
               --cleaning_text True \
               --action continue
```

Or use the provided shell script which pre-fills these same arguments:

```bash
bash run.sh
```

To extract and **translate** a French-language PDF into English:

```bash
python main.py --pdf_path "Books/my-french-document.pdf" \
               --start_page 1 \
               --end_page 100 \
               --source_lang fr \
               --target_lang en \
               --action continue
```

## Resuming Interrupted Runs

Processing a long book page by page can take hours. The `--action continue` flag (the default) makes interrupted runs resumable. On startup, the tool inspects the `Images/` directory to find the last converted page, and inspects the output `.txt` file to find the last successfully extracted page, then resumes from exactly that point:

```python
if self.action == "continue":
    images = self.list_png_files_in_folder(folder_path=self.save_images_path)
    if images:
        current_image = int(
            os.path.splitext(os.path.basename(images[-1]))[0].split("page_")[-1]
        )
        if current_image < self.end_page:
            self.start_page = current_image + 1
            self.pdf_to_image(...)   # convert only the remaining pages
        else:
            current_page = self.check_and_extract_last_page(save_path=self.save_text_path)
            self.start_crawl = current_page - self.start_page + 1
            self.page_num = current_page + 1
```

Setting `--action clear` instead wipes both the `Images/` folder and the `.txt` output file before starting fresh.

## Output Structure

After a complete run the directory looks like this:

```
رباعيات مولانا جلال الدين الرومي/
├── Images/
│   ├── page_10.png
│   ├── page_11.png
│   ├── page_12.png
│   └── ...
└── Extracted_Data/
    └── رباعيات مولانا جلال الدين الرومي.txt
```

## Text Cleaning

Scanned Arabic and Persian books frequently produce OCR artefacts — stray underscores, hyphens, and isolated digits scattered through the text. The `--cleaning_text True` flag activates a post-processing step that strips these characters. If you need different cleaning rules (for example, preserving numbers but removing punctuation), modify the `clean_text` function in `main.py` directly — it is a small, self-contained utility.

## Practical Considerations

**Speed**: Each page involves a file upload, a wait for the OCR result to render, and a DOM read. Budget roughly 8–20 seconds per page depending on image complexity and network speed.

**Rate limits**: Google Translate does not publish explicit rate limits for its image mode. The tool's sequential, page-by-page approach — with natural delays from browser rendering — keeps traffic well within normal human-usage patterns.

**Language detection**: Setting `--source_lang auto` lets Google detect the language per page, which is useful for bilingual documents or books with mixed front-matter and body languages.

**Chrome requirement**: The tool uses `webdriver.Chrome`, so Google Chrome and the matching ChromeDriver binary must be installed. The ChromeDriver version must match your installed Chrome version exactly.

## Why Not Just Use Tesseract?

[Tesseract](https://github.com/tesseract-ocr/tesseract) is the standard open-source OCR engine and an excellent choice for well-printed Latin-script documents. For Arabic, it requires a specific trained data file (`ara.traineddata`), produces noticeably lower accuracy on printed book scans, and needs extra configuration for right-to-left rendering. For Persian, support is even more limited.

Google Translate's OCR engine is trained on a vastly larger and more linguistically diverse corpus and handles Arabic, Persian, Urdu, and other scripts with high accuracy out of the box — with no additional setup.

---

*The full source code and the sample PDF are available at [github.com/v3xlrm1nOwo1/GoogleTranslateOCRExtractTextFromPDF](https://github.com/v3xlrm1nOwo1/GoogleTranslateOCRExtractTextFromPDF). The project is licensed under the MIT License.*
