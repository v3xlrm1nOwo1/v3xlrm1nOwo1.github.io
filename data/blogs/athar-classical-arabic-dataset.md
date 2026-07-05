# ATHAR: Building a High-Quality Dataset for Classical Arabic to English Translation

![ATHAR dataset overview — Classical Arabic to English translation pairs spanning 18 medieval works](https://cdn-uploads.huggingface.co/production/uploads/64af7c627ab7586520ed8688/SwkKk3Z6kT5VZ3Oj-bVMC.jpeg)

Classical Arabic is the language of the Arab golden age — the medium through which Ibn Khaldun articulated his philosophy of history, Ibn Battuta documented his journeys across the known world, and medieval scholars codified medicine, astronomy, and logic in texts that shaped civilisations. Yet when you type a sentence of Classical Arabic into Google Translate, or hand it to ChatGPT, the output often ranges from imprecise to unintelligible.

The problem is not the models themselves, but the data they were trained on. This post covers **ATHAR** (*أثر* — meaning "legacy" or "ancient work"), a dataset I built alongside Mohammed Sabry to address this gap: 66,000 high-quality Classical Arabic to English translation pairs drawn from 18 seminal works spanning the 8th through 14th centuries. The paper was accepted at the **ArabicNLP 2025** conference and is available on [ArXiv (2407.19835)](https://arxiv.org/abs/2407.19835); the dataset is publicly available on HuggingFace.

## Why Classical Arabic Is Different

Arabic exists along a spectrum. At one end sit urban dialects — the everyday spoken varieties of Cairo, Beirut, and Baghdad, heavily represented in social media data. In the middle is Modern Standard Arabic (MSA), the formal written register used in news and official documents. At the other end — far older and linguistically distinct in vocabulary, morphology, syntax, and style — is Classical Arabic.

![A folio from the Maqamat of al-Hariri (13th century), one of the most celebrated works of classical Arabic prose literature, representing the genre of literary and rhetorical Arabic that ATHAR was designed to cover](https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Maqamat_hariri.jpg/640px-Maqamat_hariri.jpg)

Current machine translation systems are trained predominantly on MSA and dialect data, which means they have learned a different language from the one they encounter in a classical text. Words share the same script but carry different meanings; grammatical constructions differ in ways that trip up even strong language models; rhetorical conventions — parallelism, intertextual quotation, the conventions of *adab* prose — are largely absent from modern training corpora. The result is that classical texts remain a formidable barrier even for powerful models.

## The Problem: A Dataset Scarcity That Blocks Progress

Producing high-quality translation systems for any language requires large, diverse, high-quality parallel corpora — aligned sentence pairs in both languages that a model can learn from. For Modern Standard Arabic, those resources exist in abundance: the OPUS-100 dataset has 1 million pairs, MultiUN has nearly 10 million, and IWSLT2017 provides 241,000 more from speech transcripts. For Classical Arabic, the picture is starkly different.

The existing Classical Arabic translation resources fall into two categories, and both have significant limitations:

**Religious text datasets** — The most mature resources are the Tanzil dataset (187,000 Quranic translation pairs in over 40 languages) and the Authentic Hadith dataset (sayings and practices of the Prophet Muhammad). These are rigorous and well-aligned, but they draw exclusively from a single domain — religious scripture. The language of the Quran and Hadith is stylistically distinct from classical prose, history, and philosophy. A model trained on these datasets learns a narrow register of Classical Arabic and does not generalise to the broader written tradition.

**Small or domain-specific corpora** — The Poem Comprehensive Dataset (PCD) provides a large Arabic poetry corpus (1.8 million lines), but it covers only one literary genre. Datasets focused on Arabic historical linguistics exist for pretraining but lack English translations, making them unusable for translation tasks directly.

For modern Arabic the problem reverses: there are large, multilingual datasets, but Modern Standard Arabic differs from Classical Arabic in vocabulary, morphology, syntax, and phraseology in ways significant enough that training on MSA data gives a model very little traction on classical texts. A dataset is not simply "Arabic" — the register matters enormously.

The result is a gap that blocks progress: **there is no large-scale, topically diverse parallel corpus for Classical Arabic to English translation**. Without it, researchers cannot fine-tune models, cannot benchmark fairly, and cannot systematically study what it would take to make Classical Arabic translation work well. ATHAR was created to fill that gap.

## The ATHAR Dataset

The name *ATHAR* (أثر) was chosen deliberately. It means "remnant," "legacy," or "ancient work" — a word that connotes both the traces left by a culture and the importance of preserving them. ATHAR addresses the dataset gap directly by combining 18 classical works into a single, unified corpus of **66,000 sentence pairs** — split into **65,000 for training** and **1,000 for testing**.

## Data Sources: 18 Works Across Seven Centuries

The corpus was assembled from 18 seminal classical Arabic texts spanning the **8th through 14th centuries** (roughly 750 CE to 1400 CE), covering the heart of the Islamic golden age. The genres represented include:

- **History** — chronicles of empires, biographies of rulers and scholars
- **Travel writing** — accounts of journeys across three continents
- **Philosophy** — epistemology, metaphysics, political theory
- **Science and medicine** — optics, biology, pharmacology
- **Poetry** — classical meters and lyrical traditions
- **Adab** — the broad genre of humanistic belles-lettres that defined courtly culture

The four largest individual sources — each contributing up to 6,000 sentence pairs — are **The History of al-Tabari**, **The Muqaddimah** of Ibn Khaldun, **The Book of Revenue** (*Kitab al-Amwal*), and **The Travels of Ibn Battuta** (*Rihla*). Together these four works alone represent an extraordinary range: history, political economy, philosophy of history, and travel literature.

Translations were collected from the **Rasaif** websites, where human volunteers have produced English translations of classical Arabic texts. Because the translators were volunteers with varying levels of documentation of their methods, every sentence pair in the dataset was **manually verified** by the authors to confirm correct Arabic–English alignment and accuracy of meaning.

## Building the Dataset: Preprocessing Pipeline

Constructing a high-quality parallel corpus from web-scraped data required addressing several data quality challenges.

**Flipped cell labels**: During scraping, approximately 15–20% of entries had their Arabic and English text swapped — a consequence of inconsistent HTML class labelling on the source websites (where `flex-right` sometimes contained English and `flex-left` sometimes contained Arabic, reversing from the convention). The script resolved this by counting Arabic-script versus Latin-script characters in each cell to determine which language was present.

**Diacritics removal**: Classical Arabic text may or may not include *tashkeel* (vowel diacritics). Because some source texts were fully diacritised and others were not, all diacritics were stripped from the corpus to produce a consistent, undiacritised representation. Retaining mixed diacritisation would have fragmented the vocabulary: words like *رَجُل* and *رجل* would be treated as different tokens despite being the same word.

**Quranic verse filtering**: A small number of Quranic passages appeared in the collected texts but were removed from the dataset. Classical Arabic Quranic text is stylistically distinct — and adequately covered by the dedicated Tanzil dataset — making it an outlier within a corpus aimed at prose and historical literature.

**Alignment verification**: All sentence pairs were manually reviewed by the authors to confirm that each Arabic sentence was correctly paired with its English counterpart and that the translation conveyed the content and intended meaning accurately.

## How ATHAR Compares to Other Arabic Datasets

To situate ATHAR within the landscape of existing resources, the paper provides a comparative linguistic analysis using several measures: dataset size, unique word count, lexical diversity (MTLD), stopword ratio, and sentence length distribution.

**MTLD** (Measure of Textual Lexical Diversity) scans a text and measures how long a passage can sustain a type–token ratio above a fixed threshold before repeating vocabulary. Higher values indicate more sustained lexical variety.

| Dataset | Size | Unique Words | MTLD | Stopword % | Avg. Sentence Length |
|---------|------|-------------|------|-----------|---------------------|
| **ATHAR** | **66K** | **138,944** | **55.63** | **26.04%** | **20.78** |
| Tanzil | 187K | 48,104 | 101.31 | 30.35% | 34.35 |
| Arabic PCD | 1.8M | 720,167 | 11.86 | 24.62% | 9.26 |
| KSUCCA | 1.9M | 908,771 | 40.87 | 24.71% | 25.33 |
| OPUS-100-ar-en | 1M | 370,601 | 17.46 | 27.59% | 8.39 |
| iwslt2017-ar-en | 241K | 185,390 | 34.12 | 29.67% | 13.86 |
| multiun-ar-en | 9.67M | 841,732 | 70.10 | 21.31% | 22.89 |

A few patterns stand out. ATHAR achieves one of the highest MTLD scores among Classical Arabic datasets — indicating sustained lexical diversity rather than vocabulary repetition. Its sentence length distribution is also notably balanced: 24% of sentences are very short (≤10 words) and 23% are very long (≥30 words), compared to highly skewed distributions in the modern datasets (OPUS-100 has 80% very short sentences, Arabic PCD has effectively 0% long sentences).

The low unique-word count in Tanzil (48,104) relative to its larger size reflects the repetitive, formulaic nature of Quranic language — by design. ATHAR's 138,944 unique words from a 66k-sentence corpus reflects the genuine variety of prose across seven centuries of different genres and authors.

## Evaluating State-of-the-Art LLMs

The second contribution of the paper is a systematic evaluation of four leading language models on the ATHAR test set:

- **GPT-4o** (OpenAI)
- **Llama-3 70B Instruct** (Meta)
- **Llama-3 8B Instruct** (Meta)
- **Llama-2 7B** (Meta)

Each model was evaluated under multiple conditions: **zero-shot**, **few-shot** (3 examples), **full fine-tuning**, and **LoRA parameter-efficient fine-tuning** (PEFT).

### Evaluation Metrics

Three complementary metrics were used:

- **METEOR** — measures alignment between generated and reference translations, with credit for synonymy and stemming, better capturing semantic equivalence than raw token overlap.
- **ROUGE-L** — measures the longest common subsequence, capturing fluency and ordering.
- **SacreBLEU** — a standardised implementation of the BLEU n-gram precision score, enabling comparable results across studies.

All metrics were computed using the HuggingFace Evaluate library.

### Inference Hyperparameters

For all models during inference: maximum 2,048 new tokens; Top-K sampling at 100; Top-P (nucleus sampling) at 0.95; temperature of 0.3.

### Fine-Tuning Setup

Fine-tuning experiments focused on **Llama-3 8B** under two regimes:

**Full fine-tuning** — all model parameters updated. Trained in instruction format (Arabic input → English response) using the 65k training samples. Precision: FP16; learning rate: 5×10⁻⁶ with a linear scheduler over 3 epochs; batch size of 16k tokens via gradient accumulation (4 samples × 2 accumulation steps); AdamW optimiser (β₁=0.90, β₂=0.999).

**LoRA PEFT** — only a small set of newly added low-rank adapter parameters are trained, keeping the base model frozen. Configuration: rank r = 8, scaling factor α = 8, no dropout, no bias training, Kaiming-uniform initialisation for the A matrix and zeros for B.

### Few-Shot Results: Llama-2 7B

The few-shot sweep across Llama-2 7B illustrates a consistent finding: performance does not reliably improve with more in-context examples, and remains low across all shot counts. This points to a fundamental limitation — the model lacks the Classical Arabic knowledge needed to leverage translation examples, rather than simply needing more demonstrations.

| Few-Shot k | METEOR | ROUGE-L | SacreBLEU |
|-----------|--------|---------|-----------|
| k = 1 | 0.050 | 0.077 | 0.4 |
| k = 2 | 0.064 | 0.061 | 0.6 |
| k = 3 | 0.089 | 0.093 | 0.4 |
| k = 5 | 0.065 | 0.065 | 0.4 |

The instability across shot counts — with k=3 performing best but k=5 performing worse than k=2 — reinforces this interpretation. The bottleneck is not prompt construction; it is the absence of Classical Arabic knowledge in the base model's pretraining distribution.

Fine-tuning on the ATHAR training set — particularly with Llama-3 8B — produced substantially better performance, confirming that the dataset provides a meaningful training signal and that the performance gap in zero-shot and few-shot settings is bridgeable with task-specific fine-tuning.

## Accessing ATHAR

The dataset is publicly available on the HuggingFace Hub:

```python
from datasets import load_dataset

dataset = load_dataset("mohamed-khalil/ATHAR")

print(dataset)
# DatasetDict({
#     train: Dataset({features: ['arabic', 'english'], num_rows: 65000}),
#     test:  Dataset({features: ['arabic', 'english'], num_rows: 1000})
# })
```

Each row contains an `arabic` field (undiacritised Classical Arabic text) and an `english` field (the corresponding human translation). The dataset can be used directly for:

- **Fine-tuning** translation models or LLMs for Classical Arabic
- **Benchmarking** — evaluating zero-shot or few-shot capabilities of new models on the 1,000-sample test split
- **Pretraining augmentation** — incorporating Classical Arabic parallel data into multilingual pretraining pipelines

## Conclusion

ATHAR is the first large-scale, topically diverse parallel dataset for Classical Arabic to English translation. Its 66,000 sentence pairs from 18 works spanning seven centuries provide a resource that covers the breadth of medieval Islamic intellectual output — from al-Tabari's history to Ibn Battuta's travels — in a format directly usable for training and evaluating modern NLP systems.

The evaluation experiments make the case clearly: current state-of-the-art language models, including GPT-4o and the Llama-3 family, have significant room for improvement on Classical Arabic translation. Fine-tuning on ATHAR consistently closes that gap, demonstrating both the quality of the dataset and the scale of what remains to be done for under-represented literary languages.

---

*The paper is available at [arxiv.org/abs/2407.19835](https://arxiv.org/abs/2407.19835) and the dataset at [huggingface.co/datasets/mohamed-khalil/ATHAR](https://huggingface.co/datasets/mohamed-khalil/ATHAR). See also the [Publications](publications.html) page.*
