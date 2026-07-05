# BaybBERT: Implementing BERT From Scratch in PyTorch

[BERT](https://arxiv.org/abs/1810.04805) — Bidirectional Encoder Representations from Transformers — changed the NLP landscape when Google released it in 2018. Within months it was setting state-of-the-art results on everything from question answering to sentiment analysis, and it became the foundation for a generation of models that followed.

But reading the paper and *understanding how every piece fits together in code* are two very different things. **BaybBERT** is my attempt to close that gap — a clean, from-scratch PyTorch implementation of BERT, pre-trained on the [IMDB movie-review dataset](https://www.kaggle.com/datasets/lakshmi25npathi/imdb-dataset-of-50k-movie-reviews) using the two original objectives: **Masked Language Modeling (MLM)** and **Next Sentence Prediction (NSP)**. The full repository is available at [github.com/v3xlrm1nOwo1/BaybBERT](https://github.com/v3xlrm1nOwo1/BaybBERT).

This article walks through every file, explaining the architectural decisions and the implementation details exactly as they appear in the code.

---

## Why BERT? A Quick Recap

Earlier language models like ELMo and GPT read text in a single direction — either left-to-right or right-to-left. BERT's key innovation is **bidirectional context**: every token can attend to every other token in the sequence simultaneously. This means the representation of the word *bank* in "river bank" is informed by both *river* (to its left) and whatever follows (to its right), rather than only one side.

![The original BERT model architecture showing the encoder-only transformer stack with bidirectional self-attention between all tokens in the input sequence](https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Bert_neural_network_1.png/1200px-Bert_neural_network_1.png)

BERT achieves this by using an **encoder-only** Transformer — no causal mask, no autoregressive decoding. It is pre-trained on two unsupervised tasks, then fine-tuned on downstream tasks with a thin classification head on top.

---

## Project Structure

The repository is lean and deliberately educational:

| File | Role |
|------|------|
| `model.py` | Config dataclass, attention, FFN, BERT encoder, pre-training heads |
| `prepare_dataset.py` | PyTorch Dataset — tokenisation, MLM masking, NSP pair construction |
| `Trainer.py` | Training and evaluation loops, Weights & Biases logging, checkpointing |
| `train.py` | Entry point — argument parsing, dataset instantiation, wires everything together |
| `utils.py` | Seeding, parameter counting, checkpoint I/O |
| `config.ini` | All hyperparameters in one place |
| `run.sh` | One-line training command |

---

## Configuration

Every hyperparameter lives in `config.ini`, keeping the code free of magic numbers:

```ini
[model_config]
vocab_size       = 71942
embed_size       = 768
block_size       = 128
num_segments     = 2
num_layer        = 12
heads            = 12
feed_forward_size = 3072
dropout          = 0.1
bias             = True
weight_decay     = 0.01
total_steps      = 1e6
warmup_steps     = 10000
norm_eps         = 1e-6

[training_config]
num_workers = 4
ckpt_path   = ./checkpoints/
```

The `Config` class in `model.py` reads these values once at startup using Python's built-in `configparser`:

```python
class Config:
    def __init__(self, config_file_path: str, section: str) -> None:
        config_parser = configparser.ConfigParser()
        config_parser.read(config_file_path)

        self.heads            = config_parser.getint(section, "heads")
        self.embed_size       = config_parser.getint(section, "embed_size")
        self.block_size       = config_parser.getint(section, "block_size")
        self.num_layer        = config_parser.getint(section, "num_layer")
        self.feed_forward_size = config_parser.getint(section, "feed_forward_size")
        self.dropout          = config_parser.getfloat(section, "dropout")
        self.warmup_steps     = config_parser.getint(section, "warmup_steps")
        self.total_steps      = config_parser.getfloat(section, "total_steps")
        self.weight_decay     = config_parser.getfloat(section, "weight_decay")
        # ... and the rest
```

These numbers mirror the original BERT-base configuration: 12 layers, 12 attention heads, a 768-dimensional embedding, and a feed-forward width of 3072 (exactly 4× the embedding size).

---

## The Model Architecture

### 1. Embeddings

BERT's input representation is the sum of three learned embedding tables:

```python
x = self.bert.dropout_embeddings(
    input_embeddings    # token identity
  + segment_embeddings  # sentence A vs sentence B
  + positional_embeddings  # position within sequence
)
```

- **Token embeddings** — a standard `nn.Embedding(vocab_size, embed_size)` table.
- **Segment embeddings** — an `nn.Embedding(num_segments, embed_size)` table with `num_segments=2`. Each token is tagged 0 if it belongs to sentence A and 1 if it belongs to sentence B. This is what allows BERT to understand paired-sentence tasks.
- **Positional embeddings** — unlike the sinusoidal positional encodings in the original Transformer paper, BERT uses a *learned* positional embedding table of size `(block_size, embed_size)`. Positions are computed on the fly:

```python
positions = torch.arange(0, seq_len, device=idx.device).unsqueeze(0).expand(batch_size, seq_len)
positional_embeddings = self.bert.positional_embeddings(positions)
```

The three embeddings are element-wise summed and then passed through a dropout layer before entering the encoder stack.

### 2. Multi-Head Self-Attention

The heart of the Transformer is scaled dot-product attention. The `MultiHeadCausalAttention` class (the name says *causal* but there is **no causal mask** — it is fully bidirectional, as BERT requires) implements this:

```python
class MultiHeadCausalAttention(nn.Module):
    def __init__(self, config: Config) -> None:
        super().__init__()
        self.head_dim = config.embed_size // config.heads
        self.scale    = 1.0 / math.sqrt(self.head_dim)

        self.keys    = nn.Linear(config.embed_size, config.embed_size, bias=config.bias)
        self.queries = nn.Linear(config.embed_size, config.embed_size, bias=config.bias)
        self.values  = nn.Linear(config.embed_size, config.embed_size, bias=config.bias)

        self.c_proj_out   = nn.Linear(config.embed_size, config.embed_size)
        self.attn_dropout = nn.Dropout(config.dropout)
        self.resid_dropout = nn.Dropout(config.dropout)
```

In the forward pass, the input tensor of shape `(batch, seq_len, embed_size)` is projected into Q, K, and V, then **split across heads** by reshaping and transposing:

```python
all_keys    = self.keys(x).view(B, T, heads, head_dim).transpose(1, 2)
all_queries = self.queries(x).view(B, T, heads, head_dim).transpose(1, 2)
all_values  = self.values(x).view(B, T, heads, head_dim).transpose(1, 2)
# shape: (batch, heads, seq_len, head_dim)
```

The attention scores are computed as scaled dot products, then masked to suppress padding tokens:

```python
scores = (all_queries @ all_keys.transpose(-2, -1)) * self.scale

# Expand the padding mask to broadcast over heads
extended_mask  = mask.unsqueeze(1).unsqueeze(2)
masked_scores  = scores.masked_fill(extended_mask == 0, float('-inf'))

attn_score = F.softmax(masked_scores, dim=-1)
attn_score = self.attn_dropout(attn_score)
```

Setting masked positions to `-inf` before softmax causes those positions to receive zero attention weight — the model never sees padding. The weighted values are then concatenated across heads and projected back to `embed_size`:

```python
out = (attn_score @ all_values).transpose(1, 2).contiguous().view(B, T, embed_size)
out = self.c_proj_out(out)
out = self.resid_dropout(out)
```

With `embed_size=768` and `heads=12`, each head operates over a 64-dimensional subspace, giving the model 12 independent "perspectives" on every token relationship.

### 3. Feed-Forward Network

Each Transformer block follows the attention layer with a position-wise feed-forward network — two linear layers with a **GELU** activation in between:

```python
class FeedForward(nn.Module):
    def __init__(self, config: Config) -> None:
        super().__init__()
        self.c_fc   = nn.Linear(config.embed_size, config.feed_forward_size, bias=config.bias)
        self.gelu   = nn.GELU()
        self.c_proj = nn.Linear(config.feed_forward_size, config.embed_size, bias=config.bias)
        self.dropout = nn.Dropout(config.dropout)

    def forward(self, x):
        return self.dropout(self.c_proj(self.gelu(self.c_fc(x))))
```

The intermediate size is `feed_forward_size = 3072`, exactly **4× the embedding dimension** — the standard ratio from the original paper. GELU (Gaussian Error Linear Unit) was chosen over ReLU because it provides a smoother, probabilistic gating that tends to work better in deep language models.

### 4. TransformerBlock

Each block wraps the attention and feed-forward sub-layers with **residual connections** and **Layer Normalization** in the pre-norm style. This layout — normalise *before* the sub-layer rather than after — has been shown to stabilise training in deep Transformer stacks:

```
x = x + Attention(LayerNorm(x))
x = x + FeedForward(LayerNorm(x))
```

The 12 blocks are stacked sequentially in `self.bert.blocks`, each sharing the same architecture but having independent weights.

### 5. Pre-Training Heads

After the encoder stack and a final `nn.LayerNorm`, the model attaches two task-specific heads:

**MLM Decoder** — projects every token's hidden state back to the vocabulary to predict masked tokens:

```python
mlm_logits = self.mlm_decoder_layer(x)
# shape: (batch, seq_len, vocab_size)
```

**NSP Classifier** — takes only the `[CLS]` token (position 0), which aggregates the sentence-pair representation:

```python
cls_rep    = x[:, 0, :]
nsp_logits = self.nsp_classifier_layer(cls_rep)
# shape: (batch, 2)  — IsNext / NotNext
```

The combined pre-training loss is the straight sum of both task losses:

```python
losses["nsp_loss"] = self.nsp_loss_fn(nsp_logits, nsp_labels)
losses["mlm_loss"] = self.mlm_loss_fn(
    mlm_logits.view(-1, self.config.vocab_size),
    mlm_labels.view(-1)
)
losses["loss"] = losses["nsp_loss"] + losses["mlm_loss"]
```

MLM uses `nn.CrossEntropyLoss` over the vocabulary. NSP uses `nn.CrossEntropyLoss` over two classes. The target for MLM (`mlm_labels`) has non-masked positions set to 0 so they contribute nothing to the loss (the dataset's `__getitem__` method handles this with a masked fill).

---

## Dataset: IMDB for Pre-Training

`prepare_dataset.py` implements `IMDBBertDataset`, a fully custom PyTorch `Dataset` that reads the IMDB CSV and constructs all the pre-training data on the fly.

### Vocabulary Construction

The tokeniser is torchtext's `basic_english` — a simple whitespace + punctuation splitter. The vocabulary is built by counting every token across all 50 000 reviews:

```python
self.tokenizer = get_tokenizer('basic_english')
self.counter   = Counter()

for sentence in sentences:
    self.counter.update(self.tokenizer(sentence))

self._fill_vocab()  # builds torchtext vocab with special tokens first
```

Five special tokens are added at index 0–4: `[PAD]`, `[UNK]`, `[CLS]`, `[SEP]`, `[MASK]`. The final vocabulary size — 71 942 — is determined by the actual corpus content.

### Optimal Sentence Length

Rather than padding everything to an arbitrary maximum, the dataset computes the **70th percentile** of sentence lengths across the corpus and uses that as the padding target. This dramatically reduces wasted computation from padding.

```python
self.optimal_sentence_length = self._find_optimal_sentence_length(sentence_lens)
# Uses: np.percentile(lengths, OPTIMAL_LENGTH_PERCENTILE)  where OPTIMAL_LENGTH_PERCENTILE = 70
```

### NSP Pair Construction

For each review, adjacent sentences form **positive pairs** (`is_next=1`). Random sentence pairs drawn from the full corpus form **negative pairs** (`is_next=0`). The dataset keeps a 1:1 ratio of positive to negative pairs:

```python
for i in range(len(review_sentences) - 1):
    first, second = review_sentences[i], review_sentences[i + 1]
    nsp.append(self._create_item(first, second, is_next=1))

    first, second = self._select_false_nsp_sentences(sentences)
    nsp.append(self._create_item(first, second, is_next=0))
```

Each item is structured as `[CLS] sentence_A [SEP] sentence_B [SEP]` padded to `optimal_sentence_length`, with segment IDs marking which tokens belong to sentence A and which to sentence B.

### MLM Masking

Exactly **15%** of tokens in each sentence are selected for masking (`MASK_PERCENTAGE = 0.15`). Of those:

- **80%** are replaced with `[MASK]`
- **20%** are replaced with a random vocabulary token

This matches the original BERT paper. Keeping some tokens at their true value (the remaining 20%) prevents the model from learning to simply ignore all `[MASK]` tokens at fine-tuning time, since no `[MASK]` tokens appear during downstream use.

```python
mask_amount = round(len_s * self.MASK_PERCENTAGE)
for _ in range(mask_amount):
    i = random.randint(0, len_s - 1)
    if random.random() < 0.8:
        sentence[i] = self.MASK          # 80% → [MASK]
    else:
        j = random.randint(5, len(self.vocab) - 1)
        sentence[i] = self.vocab.lookup_token(j)  # 20% → random token
    inverse_token_mask[i] = False
```

The `inverse_token_mask` tracks which positions were modified so that only masked tokens contribute to the MLM loss.

---

## Training Pipeline

`Trainer.py` handles the full training loop cleanly.

### Optimiser and Learning Rate Schedule

The `configure_optimizers_scheduler` method inside the BERT model builds an **AdamW** optimiser with a **linear warmup followed by linear decay** schedule — exactly as used in the original BERT paper:

```python
optimizer = torch.optim.AdamW(
    self.parameters(),
    lr=learning_rate,
    weight_decay=self.config.weight_decay   # 0.01
)

def lr_lambda(current_step):
    if current_step < self.config.warmup_steps:
        # Linear warmup
        return float(current_step) / float(max(1, self.config.warmup_steps))
    # Linear decay after warmup
    return max(
        0.0,
        float(self.config.total_steps - current_step) /
        float(max(1, self.config.total_steps - self.config.warmup_steps))
    )

scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
```

The learning rate starts at 0, ramps linearly to its target over `warmup_steps=10 000` steps, then decays linearly back to 0 over the rest of training. This prevents instability in the early steps when gradients are large.

### Training Loop

Each training step follows the standard PyTorch pattern with one important addition — **gradient clipping** (max norm 1.0) to prevent exploding gradients in the deep stack:

```python
optimizer.zero_grad()

_, losses_ = model(
    idx=idx, mask=mask,
    segment_ids=segment_ids,
    nsp_labels=nsp_labels,
    mlm_labels=mlm_labels
)
loss = losses_["loss"]

loss.backward()

norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)

optimizer.step()
scheduler.step()
```

Three loss values are tracked per batch: `train_loss` (total), `nsp_loss`, and `mlm_loss`. All three are logged to [Weights & Biases](https://wandb.ai/):

```python
wandb.log({
    "train/train_loss": loss.item(),
    "train/train_lr":   scheduler.get_last_lr()[0],
    "norm":             norm,
})
```

### Checkpointing

After every epoch, the eval loss is compared against the best seen so far. If it improves, the checkpoint is saved with a descriptive name that encodes all the key run parameters:

```python
ckpt_id = (
    f"{max_epoch}epoch_best_model_"
    f"{batch_size}batch_{lr:.0e}LR_"
    f"{seed}Seed_"
    f"{train_loss:.4f}train_loss_{eval_loss:.4f}eval_loss"
)
save_checkpoints(ckpt_id, model, ckpt_folder, epoch, optimizer)
```

`save_checkpoints` in `utils.py` saves the model's `state_dict`, the optimizer's `state_dict`, and the current epoch — everything needed to resume training or load for fine-tuning.

---

## Utility Functions

`utils.py` provides a small collection of helpers that appear throughout the codebase:

```python
def seed_everything(seed: int):
    """Ensures fully reproducible runs across random, numpy, and PyTorch."""
    random.seed(seed)
    os.environ['PYTHONHASHSEED'] = str(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.manual_seed(seed)
        torch.backends.cudnn.deterministic = True

def num_parameters(module: nn.Module, requires_grad=None) -> int:
    """Returns total (or trainable-only) parameter count."""
    return sum(
        p.numel() for p in module.parameters()
        if requires_grad is None or p.requires_grad == requires_grad
    )
```

> **Quick maths:** `embed_size=768`, `num_layer=12`, `heads=12`, `vocab_size=71942`. A rough estimate gives BaybBERT around **110 million parameters** — consistent with BERT-base.

---

## How to Run

**Step 1 — Download the IMDB dataset:**

```bash
mkdir -p ./data

curl -L -o ./data/imdb-dataset-of-50k-movie-reviews.zip \
  https://www.kaggle.com/api/v1/datasets/download/lakshmi25npathi/imdb-dataset-of-50k-movie-reviews

unzip -qq ./data/imdb-dataset-of-50k-movie-reviews.zip -d ./data
mv ./data/*.csv ./data/imdb.csv
```

**Step 2 — (Optional) Edit `config.ini`** to adjust architecture size or checkpoint path.

**Step 3 — Launch training:**

```bash
bash run.sh
```

Which runs:

```bash
python train.py \
  --config_path "config.ini" \
  --model_config_section "model_config" \
  --train_batch_size 32 \
  --eval_batch_size 64 \
  --epoch 100 \
  --learning_rate 1e-4 \
  --seed 1234
```

The training set uses the first 10 000 reviews (`ds_from=0, ds_to=10000`) and the evaluation set uses the next 1 000 (`ds_from=10001, ds_to=11001`). The full 50 000 reviews are used for vocabulary construction.

After training completes, `train_args.txt` is written to the checkpoint directory, storing the exact arguments used — useful for reproducibility.

---

## Key Takeaways

Building BaybBERT from scratch crystallised several things that are easy to miss when only reading the paper:

1. **Bidirectionality comes from the absence of a mask, not from any special mechanism.** The encoder sees all tokens simultaneously simply because no causal mask is applied to the attention scores.

2. **Segment embeddings carry the sentence-pair signal.** The `[CLS]` token alone tells the NSP head *which* pair it saw, but segment IDs tell the model *which sentence each token belongs to*. Without them, the model cannot reliably distinguish A from B.

3. **The 80/20 masking split matters.** If 100% of selected tokens were replaced by `[MASK]`, the model would learn to rely on `[MASK]` as a signal. The 20% random replacements force the model to *always* produce meaningful representations, not just for `[MASK]` positions.

4. **Linear warmup is essential.** Without it, the large initial gradients cause instability that can permanently damage the representations in the early layers.

5. **Gradient clipping is non-negotiable in deep stacks.** Clipping at max norm 1.0 is a small price to pay for the training stability it provides across 12 layers.

---

*You can explore the full source code at [github.com/v3xlrm1nOwo1/BaybBERT](https://github.com/v3xlrm1nOwo1/BaybBERT).*
