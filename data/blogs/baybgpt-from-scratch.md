# BaybGPT: Building a Decoder-Only Transformer From Scratch in PyTorch

Language models that *generate* text — GPT, Claude, Llama — all share one foundational design: the **decoder-only Transformer**. Unlike BERT, which reads an entire sequence bidirectionally to produce rich representations, a decoder-only model generates text one token at a time, always looking only to the left. This single constraint — the causal mask — is what makes autoregressive generation possible.

**BaybGPT** is a from-scratch PyTorch implementation of this architecture. What makes it especially interesting is its dataset: *[ديوان شمس الدين تبريزي](https://en.wikipedia.org/wiki/Divan-e_Shams-e_Tabrizi)* — the collected Persian and Arabic poetry of Jalal al-Din Rumi, one of the most celebrated poets in history. The model learns to generate new verse, character by character, purely from patterns in that text. The full repository is available at [github.com/v3xlrm1nOwo1/BaybGPT](https://github.com/v3xlrm1nOwo1/BaybGPT).

This article walks through every file, explains the architecture precisely as implemented, and highlights the key design decisions that distinguish a GPT-style model from an encoder like BERT.

---

## Decoder-Only vs Encoder-Only: The Core Difference

Both architectures stack Transformer blocks, but they differ in one fundamental way: **what each token is allowed to see**.

| Property | Encoder (BERT) | Decoder (GPT) |
|----------|---------------|---------------|
| Attention mask | None — all tokens see all tokens | Causal — each token sees only past tokens |
| Training objective | Masked Language Modeling + NSP | Next-token prediction |
| Primary use | Understanding (classification, QA) | Generation (text, code, poetry) |
| Token representations | Contextual (both directions) | Contextual (left-context only) |

![Illustration of the autoregressive decoder architecture — each output token is conditioned only on the tokens to its left, forming a triangular attention pattern](https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Full_GPT_architecture.png/440px-Full_GPT_architecture.png)

In BaybGPT, the causal constraint is enforced by a **lower-triangular mask** registered as a buffer — a permanent, non-trainable tensor inside the attention module.

---

## Project Structure

| File | Role |
|------|------|
| `model.py` | Config, causal attention, FFN, TransformerBlock, GPT model, `generate()` |
| `prepare_dataset.py` | Diacritic removal, `CharE` vocab builder, `Tokenizer`, `CharDataset` |
| `Trainer.py` | `CosineWithWarmupLR`, training/eval loops, text generation, checkpointing |
| `train.py` | Entry point — model, dataset, `torch.compile`, wires everything together |
| `utils.py` | Seeding, directory creation, parameter counting |
| `config.ini` | All hyperparameters in one place |
| `run.sh` | One-line training command |
| `ديوان شمس الدين تبريزي.txt` | The full poetry corpus (~1.1 MB of Arabic/Persian text) |

---

## Configuration

All hyperparameters live in `config.ini`:

```ini
[Model]
embed_size        = 512
block_size        = 512
num_layer         = 8
heads             = 8
feed_forward_size = 2048
padded_vocab_size = 64
dropout           = 0.0
bias              = False
beta_1            = 0.9
beta_2            = 0.95
eps               = 1e-8
weight_decay      = 0.1

[training_config]
num_workers             = 4
ckpt_path               = ./checkpoints/
generatation_save_dict  = ./generatation_text/generation/train
save_file_name          = BaybGPT_generated_texts.json

[dataset]
dataset_path            = ./ديوان شمس الدين تبريزي.txt
save_prepare_data_path  = ./dataset/
```

Notice `padded_vocab_size = 64`. This is a **character-level** model — every unique character in the corpus (Arabic/Persian letters, punctuation, newlines) maps to a single integer ID. With 64 unique characters, the vocabulary is tiny compared to sub-word tokenisers like BPE (typically 32 000–100 000 tokens), but it means the model must learn all linguistic patterns from scratch at the character level.

The `Config` class in `model.py` reads all 12 fields from `[Model]` using `configparser`:

```python
class Config:
    def __init__(self, config_file_path: str, section: str) -> None:
        config_parser = configparser.ConfigParser()
        config_parser.read(config_file_path)

        self.embed_size        = config_parser.getint(section, "embed_size")
        self.heads             = config_parser.getint(section, "heads")
        self.feed_forward_size = config_parser.getint(section, "feed_forward_size")
        self.block_size        = config_parser.getint(section, "block_size")
        self.padded_vocab_size = config_parser.getint(section, "padded_vocab_size")
        self.num_layer         = config_parser.getint(section, "num_layer")
        self.beta_1            = config_parser.getfloat(section, "beta_1")
        self.beta_2            = config_parser.getfloat(section, "beta_2")
        self.eps               = config_parser.getfloat(section, "eps")
        self.weight_decay      = config_parser.getfloat(section, "weight_decay")
        self.dropout           = config_parser.getfloat(section, "dropout")
        self.bias              = config_parser.getboolean(section, "bias")
```

---

## The Model Architecture

### 1. Embeddings

GPT-style input representations are simpler than BERT's — there are only two embedding tables, summed element-wise:

```python
pos = torch.arange(0, seq_len, dtype=torch.long, device=idx.device)
pos_emb = self.transformer.wpe(pos)   # Positional embeddings — (seq_len, embed_size)
tok_emb = self.transformer.wte(idx)   # Token embeddings     — (batch, seq_len, embed_size)
x = tok_emb + pos_emb
```

- **`wte`** (word/token embedding) — `nn.Embedding(padded_vocab_size, embed_size)` maps each character ID to a 512-dimensional vector.
- **`wpe`** (positional embedding) — `nn.Embedding(block_size, embed_size)` maps each position 0–511 to a 512-dimensional vector. Like BERT, these are *learned*, not sinusoidal.

There are no segment embeddings — BaybGPT processes a single continuous stream of text, not sentence pairs.

### 2. Multi-Head Causal Attention

The `MultiHeadCausalAttention` class implements the defining feature of a decoder: the **causal mask**. It is registered as a non-trainable buffer so it is automatically moved to the correct device alongside the model parameters:

```python
self.register_buffer(
    "bias",
    torch.tril(torch.ones(self.config.block_size, self.config.block_size))
          .view(1, 1, self.config.block_size, self.config.block_size)
)
```

`torch.tril` produces a lower-triangular matrix — a matrix of ones on and below the diagonal, zeros above. Position *i* can attend to positions 0 through *i*, but never to *i+1* or beyond.

The attention computation follows the standard scaled dot-product formula:

```python
# Q, K, V projections — split across heads
# Before transpose: (batch, seq_len, heads, head_dim)
# After transpose:  (batch, heads, seq_len, head_dim)
all_keys    = self.keys(x).view(B, T, heads, head_dim).transpose(1, 2)
all_queries = self.queries(x).view(B, T, heads, head_dim).transpose(1, 2)
all_values  = self.values(x).view(B, T, heads, head_dim).transpose(1, 2)

# Scaled dot-product scores
queries_keys = (all_queries @ all_keys.transpose(-2, -1)) * (1.0 / math.sqrt(head_dim))

# Apply causal mask — future positions become -inf, so softmax assigns them zero weight
queries_keys = queries_keys.masked_fill(
    self.bias[:, :, :seq_len, :seq_len] == 0, float('-inf')
)

attn_weights = F.softmax(queries_keys, dim=-1)
attn_weights = self.attn_dropout(attn_weights)

out = (attn_weights @ all_values).transpose(1, 2).contiguous().view(B, T, embed_size)
out = self.c_proj_out(out)
out = self.resid_dropout(out)
```

With `embed_size=512` and `heads=8`, each head operates in a 64-dimensional subspace.

One detail worth noting: `self.c_proj_out.NANOGPT_SCALE_INIT = 1`. This is a flag borrowed from [nanoGPT](https://github.com/karpathy/nanoGPT) that signals the weight initialisation routine to scale the output projection of each residual block by `1/√(2 × num_layer)`. Without this, residual contributions accumulate and the variance of the activations grows with depth — this scaling keeps it bounded regardless of how many blocks are stacked.

### 3. Feed-Forward Network

Each TransformerBlock pairs the attention layer with a position-wise two-layer FFN using GELU activation:

```python
# embed_size → feed_forward_size → embed_size
# 512 → 2048 → 512  (4× expansion ratio)
self.c_fc   = nn.Linear(embed_size, feed_forward_size, bias=bias)
self.gelu   = nn.GELU()
self.c_proj = nn.Linear(feed_forward_size, embed_size, bias=bias)
self.dropout = nn.Dropout(dropout)
```

The 4× intermediate expansion is standard across GPT-2, GPT-3, and most decoder Transformers that followed.

**`bias = False`** throughout. Research since GPT-2 has shown that biases in the attention and FFN layers add parameters without meaningfully improving performance, so BaybGPT omits them everywhere.

### 4. TransformerBlock — Pre-Norm Layout

Each of the 8 blocks applies Layer Normalization *before* each sub-layer (the pre-norm design), improving gradient flow in deep stacks:

```
x = x + Attention(LayerNorm(x))
x = x + FeedForward(LayerNorm(x))
```

This differs from the original "Attention Is All You Need" post-norm layout. Pre-norm has been shown to train more stably, especially at depth, and has been adopted in virtually every modern LLM.

### 5. Language Model Head and Forward Pass

After the 8 stacked blocks, a final `LayerNorm` (`ln_f`) is applied before the **language model head**:

```python
x = self.transformer.ln_f(x)
logits = self.lm_head(x)   # (batch, seq_len, padded_vocab_size=64)
```

`lm_head` is `nn.Linear(embed_size, padded_vocab_size, bias=False)`. In GPT-2, this layer's weights are **tied** with `wte` — the token embedding table is reused as the output projection, halving the parameters in the embedding layers. Given the tiny vocab size of 64 this matters less here than in full-scale models, but the pattern is consistent with the nanoGPT lineage.

The training loss is cross-entropy over next-character predictions, applied to every position in the sequence simultaneously:

```python
if targets is not None:
    loss = F.cross_entropy(
        logits.view(-1, logits.size(-1)),   # (batch × seq_len, 64)
        targets.view(-1)                     # (batch × seq_len,)
    )
```

---

## Autoregressive Generation

The `generate` method implements the core loop of every decoder-only LLM — sampling one token at a time and feeding it back as input:

```python
@torch.no_grad()
def generate(self, idx, max_new_tokens, device, temperature=1.0, top_k=None):
    for _ in range(max_new_tokens):
        # Crop context to block_size if it has grown too long
        idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]

        # Forward in bfloat16 for efficiency
        with torch.autocast(device_type=device, dtype=torch.bfloat16):
            logits, _ = self(idx_cond)

        # Take logits at the last position, apply temperature
        logits = logits[:, -1, :] / temperature

        # Optional top-k filtering — zero out all but the k highest logits
        if top_k is not None:
            v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
            logits[logits < v[:, [-1]]] = -float('Inf')

        # Sample from the resulting distribution
        probs    = F.softmax(logits, dim=-1)
        idx_next = torch.multinomial(probs, num_samples=1)

        # Append the new token and continue
        idx = torch.cat((idx, idx_next), dim=1)

    return idx
```

Three knobs control generation quality:

- **Temperature** — dividing logits by a value `< 1` sharpens the distribution (more deterministic); `> 1` flattens it (more random). Temperature 1.0 leaves the distribution unchanged.
- **Top-k** — restricting sampling to the *k* most likely characters prevents very unlikely characters from occasionally being sampled, which would disrupt the rhythm of the poetry.
- **`torch.autocast(dtype=torch.bfloat16)`** — mixed-precision inference reduces memory and speeds up generation on modern GPUs with no loss in output quality.

Generation is seeded with an all-zeros token (`torch.zeros((1, 1))`), letting the model generate freely from a blank starting point.

---

## Dataset: Rumi's Poetry, Character by Character

### The Corpus

The training data is `ديوان شمس الدين تبريزي.txt` — a text file containing the complete *Divan-e Shams* (~1.1 MB). This is one of Rumi's greatest works: tens of thousands of verses in Arabic and Persian, rich with spiritual and philosophical themes. The dataset makes BaybGPT a character-level Arabic/Persian poetry generator.

### Diacritic Removal

Arabic text often includes *harakat* (short vowel marks, U+064B–U+065F) that aid pronunciation but increase the effective character set. BaybGPT strips them before building the vocabulary:

```python
def remove_diacritics(text: str):
    arabic_diacritics = re.compile(r'[\u064B-\u065F]')
    return arabic_diacritics.sub('', text)
```

This reduces the unique character count to 64, keeping the vocabulary small and the `padded_vocab_size` configuration accurate.

### CharE and the Tokenizer

`CharE` scans all unique characters in the training set, adds `[UNK]`, and writes two JSON files:

```python
class CharE:
    def __init__(self, data):
        self.chars = sorted(list(set(data)))
        self.chars.append('[UNK]')

    def form_token_map(self):
        encoding = {ch: i for i, ch in enumerate(self.chars)}
        decoding = {i: ch for i, ch in enumerate(self.chars)}
        # Saved to ./tokens_map/encoding.json and decoding.json
```

`Tokenizer` loads these JSON files and provides `encode()` and `decode()` methods:

```python
# Encoding: "مرحبا" → [42, 18, 11, 37, 6]  (example indices)
tokenizer.encode("مرحبا")

# Decoding: [42, 18, 11, 37, 6] → "مرحبا"
tokenizer.decode([42, 18, 11, 37, 6])
```

Unrecognised characters map to the `[UNK]` index, so the model handles any input gracefully.

### CharDataset — Sliding Window

`CharDataset` implements the classic language-modelling dataset: a sliding window of `block_size=512` characters. For each window, `input` is characters 0–510 and `labels` is characters 1–511 — every input character is paired with the next character as its target:

```python
def __getitem__(self, idx):
    chunk = self.data[idx : idx + self.block_size]
    encoding = torch.tensor(self.tokenizer.encode(chunk), dtype=torch.long)
    input_ids = encoding[:-1]   # characters 0..510
    labels    = encoding[1:]    # characters 1..511
    return input_ids, labels
```

The dataset length is `len(text) - block_size`, so every possible 512-character window in the corpus becomes a training example.

The train/val split is 90/10:

```python
train_size   = int(n * 0.9)
train_data   = text[:train_size]
val_data     = text[train_size:]
```

---

## Optimiser: nanoGPT-Style AdamW

`configure_optimizers` in `model.py` separates parameters into two groups before passing them to AdamW — a technique borrowed directly from nanoGPT and GPT-2:

```python
# 2D parameters (weight matrices) get weight decay
decay_params     = [p for p in params if p.dim() >= 2]

# 1D parameters (biases, layer norm scales) do NOT get weight decay
no_decay_params  = [p for p in params if p.dim() < 2]

optim_groups = [
    {"params": decay_params,    "weight_decay": config.weight_decay},  # 0.1
    {"params": no_decay_params, "weight_decay": 0.0},
]
```

Why the split? Weight decay acts as L2 regularisation on the parameter values. Applying it to Layer Norm scale/shift parameters or biases is generally harmful — those parameters need to move freely and are already small. Applying it to weight matrices helps prevent overfitting.

The method also checks whether `fused=True` is available (a faster CUDA kernel for AdamW introduced in PyTorch 2.0):

```python
# Use fused AdamW if on CUDA and it's supported
use_fused = device == "cuda" and "fused" in inspect.signature(torch.optim.AdamW).parameters
optimizer = torch.optim.AdamW(optim_groups, lr=lr, betas=(beta_1, beta_2), eps=eps, fused=use_fused)
```

The `inspect.signature` check means the code gracefully falls back to unfused AdamW on older PyTorch versions.

---

## Learning Rate Schedule: Cosine Decay with Warmup

BaybGPT uses a **cosine annealing schedule with linear warmup**, implemented as a custom `_LRScheduler` subclass in `Trainer.py`:

```python
class CosineWithWarmupLR(_LRScheduler):
    def get_lr(self):
        # Phase 1: linear warmup
        if self.last_epoch < self.warmup_steps:
            return [base_lr * (step + 1) / self.warmup_steps for base_lr in self.base_lrs]

        # Phase 3: minimum LR after total_steps
        elif self.last_epoch > self.total_steps:
            return [self.min_lr for _ in self.base_lrs]

        # Phase 2: cosine decay
        else:
            decay_ratio = (self.last_epoch - self.warmup_steps) / self.cosine_decay_steps
            return [
                self.min_lr + 0.5 * (base_lr - self.min_lr) * (1.0 + math.cos(math.pi * decay_ratio))
                for base_lr in self.base_lrs
            ]
```

The three phases in practice (with `learning_rate=6e-4`):

| Phase | Steps | LR |
|-------|-------|-----|
| Linear warmup | First 10% | 0 → 6×10⁻⁴ |
| Cosine decay | Middle 90% | 6×10⁻⁴ → 6×10⁻⁵ |
| Floor | After total steps | 6×10⁻⁵ (held) |

Both `total_steps` and `warmup_steps` are computed dynamically from the actual dataset size and batch size, not hardcoded:

```python
lr_steps      = int(len(trainset) / batch_size * max_epoch)
warmup_steps  = int(0.1 * lr_steps)    # 10% warmup
min_lr        = learning_rate * 0.1    # 10% of peak
```

This is more principled than BERT's approach (which uses fixed `warmup_steps=10000`) — the schedule always scales correctly regardless of dataset size or number of epochs.

---

## Training Loop

The training step is clean and explicit:

```python
for itr, (input, targets) in tqdm(train_dataloader, desc="TrainBaybGPT"):
    input   = input.to(self.device)
    targets = targets.to(self.device)

    optimizer.zero_grad()
    _, loss = model(idx=input, targets=targets)

    loss.backward()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)

    optimizer.step()
    scheduler.step()

    wandb.log({"train/train_loss": loss.item(), "train/train_lr": scheduler.get_last_lr()[0]})
```

Gradient clipping at max norm **1.0** is applied after backprop and before the optimiser step. The Weights & Biases logs track both the loss and the current learning rate — this is valuable because the cosine schedule means the LR is constantly changing and it is important to be able to verify that the schedule is progressing as expected.

### Text Generation After Each Epoch

After every epoch, the model generates new poetry and saves it to a JSON file:

```python
def generate_text(self, model, num_tokens, device):
    idx = torch.zeros((1, 1), dtype=torch.long).to(self.device)
    token_ids = model.generate(idx=idx, max_new_tokens=num_tokens, device=device)
    return self.config.tokenizer.decode(token_ids.squeeze())
```

Generation starts from an all-zeros token and produces up to 512 new characters. The results are written to `generatation_text/generation/train/BaybGPT_generated_texts.json`, giving a qualitative per-epoch view of how the model is learning the style of Rumi's poetry.

---

## Performance Optimisations in train.py

`train.py` uses two PyTorch performance features that are absent from most tutorial implementations:

**1. `torch.compile`** — Compiles the model graph using TorchInductor, which fuses operations and reduces Python overhead. This can give a 30–50% speedup on CUDA:

```python
model = torch.compile(model=model)
```

**2. `torch.set_float32_matmul_precision("high")`** — Allows CUDA to use TF32 (19-bit mantissa) for matrix multiplications instead of full FP32, gaining significant throughput on Ampere and newer GPUs with negligible accuracy loss:

```python
torch.set_float32_matmul_precision("high")
```

Together, these two lines can make training significantly faster without changing the model's mathematics.

---

## How to Run

**Step 1 — Clone the repository:**

```bash
git clone https://github.com/v3xlrm1nOwo1/BaybGPT.git
cd BaybGPT
```

**Step 2 — (Optional) Edit `config.ini`** to adjust model size, `block_size`, or checkpoint paths.

**Step 3 — Prepare the character vocabulary:**

```bash
python prepare_dataset.py
```

This reads the poetry file, removes diacritics, builds `tokens_map/encoding.json` and `tokens_map/decoding.json`.

**Step 4 — Launch training:**

```bash
bash run.sh
```

Which runs:

```bash
python train.py \
  --config_path "config.ini" \
  --model_config_section "Model" \
  --train_batch_size 32 \
  --eval_batch_size 64 \
  --epoch 100 \
  --learning_rate 6e-4 \
  --seed 1234 \
  --num_generated_tokens 512 \
  --show_generated_text True
```

After each epoch, generated poetry appears in `generatation_text/generation/train/BaybGPT_generated_texts.json`. Checkpoints are saved to `./checkpoints/` with descriptive names encoding all key run parameters.

---

## Key Takeaways

Building BaybGPT from scratch made several subtleties concrete:

1. **The causal mask is what makes a decoder.** It is nothing more than a lower-triangular matrix of ones. Registering it as a buffer (not a parameter) ensures it is automatically moved to GPU alongside the model, and that it is never updated during backprop.

2. **Character-level models have no tokenisation overhead but harder learning tasks.** The model must learn that `ا`, `ل`, `م` together form a word before it can learn what the word means. Sub-word models like BPE skip straight to the word level.

3. **Separating weight decay by parameter dimension is a meaningful choice, not boilerplate.** Applying weight decay to Layer Norm parameters harms training. The `dim() >= 2` check is the cleanest way to split matrices from scalars.

4. **Cosine schedule feels noticeably different from linear decay in practice.** The smooth, slow deceleration of cosine allows the model to take large steps early, then refine its weights with progressively smaller steps as it converges — this matches the loss landscape of language models well.

5. **`torch.compile` is almost always worth turning on.** It requires no code changes and consistently gives measurable speedups on modern hardware.

6. **Starting generation from an all-zeros token** lets the model choose its own starting point, making the generated text fully unconstrained by any prompt. This is useful for evaluating how well the model has learned the distribution of the training corpus.

---

*For the encoder counterpart of this model — BERT's bidirectional architecture and MLM/NSP pre-training — see the post on [BaybBERT](/blog-post?post=baybbert-from-scratch). The full source code for BaybGPT is at [github.com/v3xlrm1nOwo1/BaybGPT](https://github.com/v3xlrm1nOwo1/BaybGPT).*
