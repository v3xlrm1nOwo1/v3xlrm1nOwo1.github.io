# Transformer Implementation From Scratch: Arabic-to-English Machine Translation in PyTorch

In 2017, Vaswani et al. published [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762) and changed the trajectory of NLP entirely. The paper introduced the **Transformer** — a model that relies entirely on attention mechanisms and discards recurrence altogether. Every modern large language model (GPT, BERT, T5, LLaMA) is descended from that architecture.

The **Transformer-Implementation** project is a faithful, from-scratch PyTorch implementation of that original paper. The task is **Arabic-to-English machine translation**, using an `arabic_english.txt` corpus of over 6 million characters of parallel sentence pairs. Unlike BaybBERT (encoder-only) and BaybGPT (decoder-only), this project implements the **full encoder-decoder architecture**: an encoder that reads and understands Arabic, and a decoder that generates the English translation. The full repository is available at [github.com/v3xlrm1nOwo1/Transformer-Implementation](https://github.com/v3xlrm1nOwo1/Transformer-Implementation).

This article walks through every file line by line, explaining each architectural decision and how it relates to the original paper.

---

## Architecture Overview

The Transformer's encoder-decoder design was built for **sequence-to-sequence** tasks where the input and output are different sequences — and potentially in different languages. The encoder processes the source sequence (Arabic) once, producing a rich representation. The decoder then generates the target sequence (English) token by token, with full access to the encoder's representation at every step.

![The original Transformer architecture from "Attention Is All You Need" — encoder on the left, decoder on the right, connected through cross-attention](https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/The-Transformer-model-architecture.png/440px-The-Transformer-model-architecture.png)

The three types of attention in the model serve distinct roles:

| Attention Type | Where | Queries from | Keys & Values from | Mask |
|---|---|---|---|---|
| Multi-Head Self-Attention | Encoder | Source sequence | Source sequence | Padding mask |
| Masked Multi-Head Self-Attention | Decoder | Target sequence | Target sequence | Padding + Causal |
| Cross-Attention (Encoder-Decoder) | Decoder | Target sequence | Encoder output | Padding mask (source) |

---

## Project Structure

| File | Role |
|------|------|
| `model.py` | All model classes: Config, embeddings, attention, FFN, Encoder, Decoder, Transformer |
| `tokenizer.py` | `TranslateTokenizer` — word-level tokenizer for Arabic and English |
| `prepare_dataset.py` | Data loading, diacritic removal, `TranslateDataset` |
| `Trainer.py` | Training/eval loops, translation samples, checkpointing |
| `train.py` | Entry point — wires everything together |
| `utils.py` | Seeding, checkpoint saving with full optimizer state |
| `config.ini` | All hyperparameters |
| `run.sh` | One-line training command |
| `arabic_english.txt` | ~6.5 MB bilingual Arabic-English parallel corpus |

---

## Configuration

All 17 model hyperparameters are stored in `config.ini`:

```ini
[Model]
embed_size         = 512
block_size         = 256
num_layer          = 6
heads              = 8
feed_forward_size  = 2048
encoder_vocab_size = 32412
decoder_vocab_size = 58986
dropout            = 0.1
bias               = False
label_smoothing    = 0.1
pad_idx            = 0
sos_idx            = 2
eos_idx            = 3
beta_1             = 0.9
beta_2             = 0.98
optim_eps          = 1e-9
norm_eps           = 1e-6

[training_config]
num_workers            = 4
ckpt_path              = ./checkpoints/
generatation_save_dict = ./generatation_text/generation/train
save_file_name         = transformer_generated_texts.json

[dataset]
tokenizer_path         = tokenizer
dataset_path           = ./arabic_english.txt
save_prepare_data_path = ./dataset/
```

Two points stand out immediately:

- **Separate vocabulary sizes** — `encoder_vocab_size=32412` for English and `decoder_vocab_size=58986` for Arabic. Arabic has a much larger morphological word space than English, so its vocabulary is nearly twice the size.
- **`label_smoothing=0.1`** — a regularisation technique that prevents the model from becoming overconfident in its predictions. Instead of training the model toward a one-hot distribution (probability 1.0 on the correct token), it targets a softened distribution (0.9 on the correct token, 0.1 spread across all others). This was used in the original Transformer paper.

The `Config` class in `model.py` reads all fields and immediately validates the key architectural invariant:

```python
def __post_init__(self):
    assert self.embed_size % self.heads == 0, "Embedding size needs to be divisible by heads"
```

With `embed_size=512` and `heads=8`, each head operates in a 64-dimensional subspace.

---

## The Model Architecture (`model.py`)

### 1. Input Embedding — Scaled by √d

The embedding lookup is followed by a scaling factor from the original paper:

```python
class InputEmbedding(nn.Module):
    def __init__(self, config: Config, vocab_size: int):
        self.embedding = nn.Embedding(vocab_size, config.embed_size)
        self.scale = math.sqrt(config.embed_size)   # √512 ≈ 22.6

    def forward(self, tokens):
        return self.embedding(tokens) * self.scale
```

Multiplying by `√embed_size` brings the embedding vectors into a comparable magnitude to the positional encodings before they are summed. Without it, learned embeddings (which are initialised with unit normal weights) would be dwarfed by the fixed sinusoidal values. The encoder and decoder each have their own `InputEmbedding` with their respective vocabulary sizes.

### 2. Positional Encoding — Sinusoidal

Unlike BaybBERT and BaybGPT (which use **learned** positional embeddings), this implementation follows the original paper's **fixed sinusoidal** encoding:

```python
class PositionalEncoding(nn.Module):
    def __init__(self, config: Config):
        pe = torch.zeros(config.block_size, config.embed_size)
        position = torch.arange(0, config.block_size).float().unsqueeze(1)

        div_term = torch.exp(
            torch.arange(0, config.embed_size, 2).float() * (-math.log(10000.0) / config.embed_size)
        )

        pe[:, 0::2] = torch.sin(position * div_term)   # Even dimensions: sine
        pe[:, 1::2] = torch.cos(position * div_term)   # Odd dimensions: cosine

        pe = pe.unsqueeze(0)               # (1, block_size, embed_size)
        self.register_buffer("pe", pe)

    def forward(self, x):
        batch_size, seq_len = x.size()
        return self.pe[:, :seq_len, :]    # Returns (1, seq_len, embed_size)
```

The `div_term` formula computes the denominator of each sinusoidal frequency using a log-space trick: `exp(-log(10000) * i/d) = 10000^(-i/d)`. This gives position *pos* at dimension *i* the encoding `sin(pos / 10000^(i/d))` for even *i* and `cos(pos / 10000^(i/d))` for odd *i*.

The result is registered as a non-trainable buffer so it moves to GPU with the model but is never updated by the optimizer.

### 3. Layer Normalisation — Manual Implementation

Rather than using PyTorch's built-in `nn.LayerNorm`, the implementation defines its own, following the paper exactly:

```python
class LayerNormalization(nn.Module):
    def __init__(self, config: Config):
        self.eps   = config.norm_eps                               # 1e-6
        self.alpha = nn.Parameter(torch.ones(config.embed_size))   # Scale (γ)
        self.bias  = nn.Parameter(torch.zeros(config.embed_size))  # Shift (β)

    def forward(self, x):
        mean = x.mean(dim=-1, keepdim=True)
        std  = x.std(dim=-1, keepdim=True)
        return self.alpha * (x - mean) / (std + self.eps) + self.bias
```

`alpha` (initialised to ones) and `bias` (initialised to zeros) are learned per-dimension affine parameters, exactly as in the paper. Using `norm_eps=1e-6` rather than the more common `1e-5` provides slightly better numerical stability for gradients near zero.

### 4. Multi-Head Attention — One Class for All Three Attention Types

The most elegant design decision in the model is that **a single `MultiHeadAttention` class handles all three attention operations** — encoder self-attention, decoder masked self-attention, and cross-attention. The switch is controlled by the `encoder_output` parameter:

```python
class MultiHeadAttention(nn.Module):
    def forward(self, x, attn_mask, encoder_output=None):
        # If encoder_output is provided → cross-attention (K,V from encoder)
        # If not → self-attention (K,V from x itself)
        k, v = (encoder_output, encoder_output) if encoder_output is not None else (x, x)
        q = x

        # Project and split into heads
        # (batch, seq, embed) → (batch, heads, seq, head_dim)
        all_keys    = self.keys(k).view(...).transpose(1, 2)
        all_queries = self.queries(q).view(...).transpose(1, 2)
        all_values  = self.values(v).view(...).transpose(1, 2)

        # Scaled dot-product attention
        attn_weights = (all_queries @ all_keys.transpose(-2, -1)) * self.scale

        # Apply mask — positions where mask==0 become -inf (→ 0 after softmax)
        if attn_mask is not None:
            attn_weights = attn_weights.masked_fill(attn_mask == 0, float("-inf"))

        attn_weights = F.softmax(attn_weights, dim=-1)
        attn_weights = self.dropout(attn_weights)

        out = (attn_weights @ all_values).transpose(1, 2).contiguous().view(B, T, embed_size)
        return self.c_proj_out(out)
```

When `encoder_output` is passed (in cross-attention), the queries come from the decoder's current state while the keys and values come from the encoder's output — giving the decoder access to the full source context at every generation step.

`self.scale = 1.0 / math.sqrt(self.head_dim)` pre-computes the scaling factor (1/√64 ≈ 0.125), equivalent to the paper's `1/√d_k`.

### 5. Feed-Forward Network — ReLU, Not GELU

The FFN in this implementation uses **ReLU** activation, matching the original 2017 paper, rather than the GELU used in later models (GPT-2, BERT):

```python
class FeedForward(nn.Module):
    def forward(self, x):
        out = F.relu(self.c_fc(x))    # embed_size → feed_forward_size (2048)
        out = self.dropout(out)
        out = self.c_proj(out)         # feed_forward_size → embed_size
        return out
```

The 4× intermediate expansion (`512 → 2048 → 512`) and dropout between the two projections are identical to the original paper.

### 6. EncoderBlock — Post-Norm Layout

```python
class EncoderBlock(nn.Module):
    def forward(self, x, src_mask):
        # Self-attention sub-layer
        out = self.attention(x=x, attn_mask=src_mask)
        out = self.dropout_attn(out)
        out = self.norm_attn(out + x)          # Add & Norm (post-norm)

        # FFN sub-layer
        x = out
        out = self.ffwd(x)
        out = self.dropout_ffwd(out)
        out = self.norm_ffwd(out + x)          # Add & Norm (post-norm)
        return out
```

This follows the original paper's **post-norm** arrangement: `LayerNorm(x + Sublayer(x))`. This differs from the pre-norm style used in BaybBERT and BaybGPT. Both are valid — post-norm matches the paper exactly; pre-norm generally trains more stably in very deep models.

### 7. DecoderBlock — Three Sub-Layers

The decoder block has three sub-layers instead of two: masked self-attention, cross-attention, and the FFN:

```python
class DecoderBlock(nn.Module):
    def forward(self, x, encoder_output, trg_mask, src_mask):
        # Sub-layer 1: Masked self-attention (cannot see future tokens)
        out = self.attention(x=x, attn_mask=trg_mask)
        out = self.dropout_attn(out)
        out = self.norm_attn(out + x)

        # Sub-layer 2: Cross-attention (queries from decoder, K/V from encoder)
        x = out
        out = self.enc_dec_attention(x=x, attn_mask=src_mask, encoder_output=encoder_output)
        out = self.dropout_enc_dec_attn(out)
        out = self.norm_enc_dec_attn(out + x)

        # Sub-layer 3: Feed-forward network
        x = out
        out = self.ffn(x)
        out = self.dropout_attn(out)
        out = self.norm_ffwd(out + x)
        return out
```

The `trg_mask` is a **combined mask** — a bitwise AND of the padding mask and the causal mask — ensuring that the decoder neither attends to padding tokens nor to future tokens. The `src_mask` passed to cross-attention is the encoder's padding mask, preventing the decoder from attending to `[PAD]` positions in the source sequence.

### 8. Encoder and Decoder Modules

Each side has its own embedding + positional encoding, stacked on top of its respective blocks:

```python
class Encoder(nn.Module):
    def __init__(self, config):
        self.encoder = nn.ModuleDict(dict(
            wte     = InputEmbedding(vocab_size=config.encoder_vocab_size, config=config),
            wpe     = PositionalEncoding(config=config),
            dropout = nn.Dropout(p=config.dropout),
            h       = nn.ModuleList([EncoderBlock(config) for _ in range(config.num_layer)]),
        ))

    def forward(self, x, src_mask):
        tok_emb = self.encoder.wte(x)          # Scaled token embeddings
        pos_emb = self.encoder.wpe(x)          # Sinusoidal positions
        x = self.encoder.dropout(tok_emb + pos_emb)

        for block in self.encoder.h:
            x = block(x, src_mask)
        return x    # (batch, src_len, 512)
```

The decoder mirrors this structure with `decoder_vocab_size` for its embedding table, and its blocks receive both `encoder_output` and the two masks.

### 9. The Transformer — Forward Pass, Masks, and Loss

```python
class Transformer(nn.Module):
    def forward(self, src, trg, targets=None):
        src_mask = self.padding_mask(src)                     # (B, 1, 1, src_len)
        trg_mask = self.padding_mask(trg) & self.causal_mask(trg)   # (B, 1, trg_len, trg_len)

        encoder_output = self.encoder(x=src, src_mask=src_mask)
        decoder_output = self.decoder(x=trg, encoder_output=encoder_output,
                                      trg_mask=trg_mask, src_mask=src_mask)

        logits = self.projection(decoder_output)    # (B, trg_len, decoder_vocab_size)

        if targets is not None:
            loss = F.cross_entropy(
                logits.view(-1, logits.size(-1)),
                targets.view(-1),
                ignore_index=self.config.pad_idx,       # Pads don't contribute to loss
                label_smoothing=self.config.label_smoothing   # 0.1
            )
        return logits, loss
```

**Padding mask** — `(idx != pad_idx)` broadcast to shape `(B, 1, 1, T)`. Positions with `pad_idx=0` are masked out of attention.

**Causal mask** — `torch.tril(ones(T, T))`, broadcast to `(B, 1, T, T)`. Future positions are masked out.

**`ignore_index=pad_idx`** — Padding tokens in the target are excluded from the loss computation. The model is not penalised for what it predicts at `[PAD]` positions.

**`label_smoothing=0.1`** — Blends the target distribution with a uniform distribution, preventing overconfidence and improving generalisation.

### 10. Weight Initialisation

After all sub-modules are built, the Transformer applies Xavier uniform initialisation to all linear layers and normal initialisation to all embedding tables:

```python
def _initialize_weights(self, module):
    if isinstance(module, nn.Linear):
        nn.init.xavier_uniform_(module.weight)
        if module.bias is not None:
            nn.init.zeros_(module.bias)
    elif isinstance(module, nn.Embedding):
        nn.init.normal_(module.weight, mean=0, std=1)
```

Xavier uniform draws weights from `Uniform(-√(6/(fan_in + fan_out)), +√(6/(fan_in + fan_out)))`, which keeps gradient variances stable at initialisation across all layer depths. This is important for the post-norm layout used here — post-norm is more sensitive to poor initialisation than pre-norm.

---

## The Noam Learning Rate Schedule

The original Transformer paper introduced a distinctive learning rate schedule: increase the LR linearly for the first `warmup_steps` steps, then decrease it in proportion to the inverse square root of the step number. This is called the **Noam schedule**:

```python
def get_std_optimizer(self, learning_rate, warmup_steps=4000):
    optimizer = torch.optim.Adam(
        self.parameters(), lr=learning_rate,
        betas=(self.config.beta_1, self.config.beta_2),   # (0.9, 0.98)
        eps=self.config.optim_eps                          # 1e-9
    )
    scheduler = LambdaLR(
        optimizer,
        lambda step: self._rate(step, self.config.embed_size, warmup_steps)
    )
    return optimizer, scheduler

def _rate(self, step, model_dim, warmup_steps):
    step = max(step, 1)
    scale = model_dim ** -0.5
    return scale * min(step ** -0.5, step * warmup_steps ** -1.5)
```

The formula is: `lr = d_model^(-0.5) × min(step^(-0.5), step × warmup^(-1.5))`.

During warmup, `step × warmup^(-1.5) < step^(-0.5)`, so the LR grows linearly. After `step = warmup_steps`, `step^(-0.5)` becomes the smaller term and the LR decays. The peak occurs exactly at `step = warmup_steps`.

| Property | Value at default config (`d=512, warmup=4000`) |
|---|---|
| LR formula | `512^(-0.5) × min(step^(-0.5), step × 4000^(-1.5))` |
| Peak LR | At step 4000 |
| Decay after peak | ∝ step^(-0.5) |

This is notably different from BaybGPT's cosine schedule — the Noam schedule is aggressive early (fast warmup to peak) and very gradual late (slow inverse-root decay). The `beta_2=0.98` and `eps=1e-9` also match the original paper's Adam hyperparameters exactly.

---

## Tokenizer: Word-Level with Special Tokens

The project uses two separate `TranslateTokenizer` instances — one for English, one for Arabic. The tokenizer is word-level (whitespace splitting), built on top of the HuggingFace `tokenizers` library with a custom vocabulary:

```python
class TranslateTokenizer:
    def build_vocab(self, sequences):
        # Special tokens always get fixed IDs:
        # [PAD] → 0, [UNK] → 1, [SOS] → 2, [EOS] → 3
        special_tokens = ["[PAD]", "[UNK]", "[SOS]", "[EOS]"]
        vocab = {token: idx for idx, token in enumerate(special_tokens)}

        for seq in sequences:
            for token in seq.split():         # Word-level splitting
                if token not in vocab:
                    vocab[token] = len(vocab)
        return vocab
```

Fixing `[PAD]=0, [UNK]=1, [SOS]=2, [EOS]=3` is important — these IDs must match `pad_idx=0, sos_idx=2, eos_idx=3` in `config.ini` exactly. The `build_vocab` method processes only the training sentences, so validation vocabulary words will be mapped to `[UNK]=1`.

The tokenizers are saved as JSON files in the `tokenizer/` directory after training:
```
tokenizer/english_tokenizer.json
tokenizer/arabic_tokenizer.json
```

These can be reloaded with `TranslateTokenizer.load(path)` for inference without rebuilding from the corpus.

---

## Dataset: Arabic-to-English Parallel Corpus

### The Data Format

`arabic_english.txt` contains tab-separated sentence pairs, one per line:
```
English sentence here\tالجملة العربية هنا
```

`TranslateData` reads this file, splits on `\t`, and applies the same Arabic diacritic removal used in BaybGPT:

```python
def _clean_data(self, text):
    arabic_diacritics = re.compile(r'[\u064B-\u065F]')
    return arabic_diacritics.sub('', text)
```

After loading, the class also computes `min_english`, `max_english`, `min_arabic`, `max_arabic` — the min and max word counts per language. This is logged in `train.py` and is useful for verifying that `block_size=256` is sufficient for the corpus.

### TranslateDataset — Three Tensors Per Sample

For each sentence pair `(english, arabic)`, `TranslateDataset.__getitem__` builds three separate tensors of identical length `block_size=256`:

```python
# Encoder input: [SOS] + english_tokens[: 254] + [EOS] + [PAD...]
encoder_input_ids = torch.cat([
    torch.tensor([sos_token_id]),
    english_ids[:block_size - 2],
    torch.tensor([eos_token_id]),
    torch.tensor([pad_token_id] * padding_needed),
])

# Decoder input (teacher forcing): [SOS] + arabic_tokens[: 255] + [PAD...]
decoder_input_ids = torch.cat([
    torch.tensor([sos_token_id]),
    arabic_ids[:block_size - 1],
    torch.tensor([pad_token_id] * padding_needed),
])

# Target (labels): arabic_tokens[: 255] + [EOS] + [PAD...]
target_input_ids = torch.cat([
    arabic_ids[:block_size - 1],
    torch.tensor([eos_token_id]),
    torch.tensor([pad_token_id] * padding_needed),
])
```

The relationship between `decoder_input_ids` and `target_input_ids` is the standard **teacher forcing** arrangement: at every position *t*, the decoder sees `[arabic_0 ... arabic_{t-1}]` as input and is trained to predict `arabic_t` as output. The shift by one position means:

- Decoder position 0 receives `[SOS]` and must predict `arabic_0`
- Decoder position 1 receives `arabic_0` and must predict `arabic_1`
- ...
- Decoder position N-1 receives `arabic_{N-2}` and must predict `[EOS]`

The 90/10 train/val split is applied to the shuffled full dataset in `train.py`.

---

## Training Loop

The training step iterates over all three tensors:

```python
for itr, (encoder_input_ids, decoder_input_ids, target_input_ids) in batch_iterator:
    _, loss = model(
        src=encoder_input_ids,
        trg=decoder_input_ids,
        targets=target_input_ids
    )

    loss.backward()
    norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)

    optimizer.step()
    scheduler.step()
    optimizer.zero_grad()

    wandb.log({
        "train/train_loss": loss.item(),
        "norm": norm,
        "train/train_lr": scheduler.get_last_lr()[0]
    })
```

Gradient clipping at max norm **1.0** is applied before every optimizer step. Notably, the Wandb log also records the gradient norm (`norm`) — this is useful for diagnosing training instability, particularly in the post-norm layout which is more sensitive to gradient spikes.

### Live Translation Samples Every 1000 Steps

Every 1000 training iterations, the model generates a translation sample and logs it to a JSON file:

```python
if itr % 1000 == 0:
    result = self.generate_text(model=model, data_loader=eval_dataloader)
    # result contains:
    # "source": the English input (after removing [PAD] tokens)
    # "model_generation": the model's Arabic translation
    # "target": the reference Arabic translation
```

This gives a qualitative view of how quickly the model learns to translate, without waiting for the end of an epoch.

### Checkpointing — Full Training State

`utils.save_checkpoints` saves both the model weights *and* the optimizer state:

```python
def save_checkpoints(ckpt_id, model, ckpt_folder, epoch, optimizer):
    torch.save({
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict()
    }, f"{ckpt_folder}/{ckpt_id}.pth")
```

Saving the optimizer state (Adam's running moment estimates `m` and `v` for every parameter) is essential for **resuming training** from a checkpoint. Without it, the Adam moments are reset to zero, which effectively restarts the warmup phase of the Noam schedule and corrupts training continuity.

---

## Greedy Decoding at Inference

Translation at inference time uses **greedy decoding**: always pick the single most likely next token. The encoder is run once; then the decoder is extended one token at a time:

```python
@torch.no_grad()
def greedy_decode(self, model, source):
    src_mask = self.padding_mask(source)
    encoder_output = model.encoder(x=source, src_mask=src_mask)

    # Start with just the [SOS] token
    decoder_input = torch.empty(1, 1).fill_(sos_idx).type_as(source)

    while True:
        if decoder_input.size(1) == self.config.block_size:
            break   # Hit maximum length

        trg_mask = self.padding_mask(decoder_input) & self.causal_mask(decoder_input)
        decoder_output = self.decoder(x=decoder_input, encoder_output=encoder_output,
                                      trg_mask=trg_mask, src_mask=src_mask)

        prob = model.projection(decoder_output[:, -1])   # Logits at the last position
        _, next_word = torch.max(prob, dim=1)             # Greedy: argmax

        decoder_input = torch.cat([decoder_input,
                                   torch.tensor([[next_word.item()]])], dim=1)

        if next_word == eos_idx:
            break   # Model declared end of translation

    return decoder_input.squeeze(0)
```

The encoder is called only once — its output is cached and reused for every decoder step. Each decoder call receives the full translation so far and produces the next token from its final position. The loop stops either when `[EOS]` is predicted or when `block_size=256` tokens have been generated.

---

## How to Run

**Step 1 — Clone the repository:**

```bash
git clone https://github.com/v3xlrm1nOwo1/Transformer-Implementation.git
cd Transformer-Implementation
```

**Step 2 — (Optional) Adjust `config.ini`** — Change `block_size`, layer count, or checkpoint paths as needed.

**Step 3 — Launch training:**

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
  --show_generated_text True
```

Tokenizer files are built automatically from the training data and saved to `tokenizer/`. Translation samples appear in `generatation_text/generation/train/transformer_generated_texts.json` every 1000 steps. Checkpoints are saved to `./checkpoints/` with descriptive filenames encoding epoch count, batch size, learning rate, seed, and train/eval losses.

---

## Key Takeaways

Implementing the original Transformer from scratch made these subtleties concrete:

1. **The `encoder_output=None` trick is a clean design.** A single `MultiHeadAttention` class handles self-attention, masked self-attention, and cross-attention by checking whether `encoder_output` is provided. This avoids duplicating the attention mechanics across three separate classes.

2. **Post-norm (original paper) vs pre-norm (modern practice) is a real tradeoff.** Post-norm requires careful weight initialisation (Xavier uniform here) to train stably. Pre-norm is more forgiving but diverges slightly from the original paper's design.

3. **The Noam schedule's peak at step 4000 is a deliberate choice.** With `warmup_steps=4000`, the LR reaches its maximum precisely when the model has seen enough data to safely use high learning rates. Changing `warmup_steps` should scale with the dataset size.

4. **Label smoothing is essential for translation.** It prevents the model from assigning near-zero probability to valid translations that weren't in the training data. A smoothing factor of 0.1 is standard.

5. **Saving optimizer state in checkpoints enables true training resumption.** For tasks as large as machine translation, being able to stop and continue training without resetting Adam's momentum is not optional.

6. **Separate encoder and decoder vocabularies are necessary for translation.** The model maps Arabic (58 986 tokens) and English (32 412 tokens) into the same 512-dimensional space, but through independently learned embedding tables. They must remain separate because the two languages have entirely different lexicons.

---

*For the encoder-only architecture (BERT, bidirectional attention, MLM pre-training), see the post on [BaybBERT](/blog-post?post=baybbert-from-scratch). For the decoder-only architecture (GPT, causal masking, autoregressive generation), see the post on [BaybGPT](/blog-post?post=baybgpt-from-scratch). The full source code for this Transformer is at [github.com/v3xlrm1nOwo1/Transformer-Implementation](https://github.com/v3xlrm1nOwo1/Transformer-Implementation).*
