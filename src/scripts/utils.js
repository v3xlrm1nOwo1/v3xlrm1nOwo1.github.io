/* ══════════════════════════════════════════════════════════
   utils.js — Data fetchers, Markdown renderer helpers, and
   math/footnote processors. Loaded as a plain <script> on
   every page. The init() IIFE at the bottom auto-detects
   which page is active and runs the appropriate fetchers.
   ══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════════ */

/* ── Post URL builder ─────────────────────────────────── */
function getPostUrl(slug) {
    return "blog-post?post=" + slug;
}

/* ── Carousel scroll — scoped to each container ──────── */

document.querySelectorAll("[data-scroll]").forEach(function (btn) {
    btn.addEventListener("click", function () {
        const dir = btn.getAttribute("data-scroll");
        const wrap = btn.closest(".main-scroll-div");
        const el = wrap
            ? wrap.querySelector(".scroll-images")
            : document.querySelector(".scroll-images");
        if (el)
            el.scrollBy({
                left: dir === "left" ? -350 : 350,
                behavior: "smooth",
            });
    });
});

/* ── Skeleton helpers ─────────────────────────────────── */

function makeSkeleton(type) {
    const el = document.createElement("div");
    if (type === "paper") {
        el.className = "skeleton-paper";
        el.innerHTML =
            '<div class="skeleton-item sk-title"></div>' +
            '<div class="skeleton-item sk-meta"></div>' +
            '<div class="skeleton-item sk-line"></div>' +
            '<div class="skeleton-item sk-line"></div>';
    } else {
        el.className = "skeleton-recent-card";
        el.innerHTML =
            '<div class="skeleton-item sk-title"></div>' +
            '<div class="skeleton-item sk-meta"></div>' +
            '<div class="skeleton-item sk-desc"></div>';
    }
    return el;
}

function showSkeleton(container, type, count) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) frag.appendChild(makeSkeleton(type));
    container.appendChild(frag);
}

/* ── Reading time calculator ──────────────────────────── */

function calcReadingTime(md) {
    const words = md
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`]*`/g, "")
        .replace(/!\[.*?\]\(.*?\)/g, "")
        .replace(/\[.*?\]\(.*?\)/g, "")
        .replace(/[#>*_~|]/g, "")
        .trim()
        .split(/\s+/)
        .filter(function (w) {
            return w.length > 0;
        });
    return Math.max(1, Math.ceil(words.length / 200));
}

/* ── Math (KaTeX) pre/post processing ───────────────────────
   Protects $...$ and $$...$$ from being mangled by marked.js
   by swapping them out for unique placeholders before parsing,
   then rendering them with KaTeX after.
   ─────────────────────────────────────────────────────────── */

function extractMath(md) {
    const blocks = [];
    const spans = [];

    /* Display math $$...$$ — may span multiple lines */
    let out = md.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math) {
        const id = blocks.length;
        blocks.push(math);
        return "\n\n\u0002KBLOCK" + id + "\u0003\n\n";
    });

    /* Inline math $...$ — must not cross newlines, must not start with $ */
    out = out.replace(/\$([^\n$][^\n]*?[^\n$]?)\$/g, function (_, math) {
        const id = spans.length;
        spans.push(math);
        return "\u0002KINLINE" + id + "\u0003";
    });

    return { out: out, blocks: blocks, spans: spans };
}

function restoreMath(html, blocks, spans) {
    const kt = typeof katex !== "undefined" ? katex : null;

    function renderBlock(i) {
        if (!kt)
            return (
                '<pre class="math-fallback">$$' +
                (blocks[+i] || "") +
                "$$</pre>"
            );
        try {
            return (
                '<div class="math-display">' +
                kt.renderToString((blocks[+i] || "").trim(), {
                    displayMode: true,
                    throwOnError: false,
                }) +
                "</div>"
            );
        } catch (e) {
            return blocks[+i] || "";
        }
    }

    function renderInline(i) {
        if (!kt) return "$" + (spans[+i] || "") + "$";
        try {
            return kt.renderToString((spans[+i] || "").trim(), {
                displayMode: false,
                throwOnError: false,
            });
        } catch (e) {
            return spans[+i] || "";
        }
    }

    /* Display blocks may be wrapped in <p> by marked */
    html = html.replace(
        /<p>\s*\u0002KBLOCK(\d+)\u0003\s*<\/p>/g,
        function (_, i) {
            return renderBlock(i);
        },
    );
    html = html.replace(/\u0002KBLOCK(\d+)\u0003/g, function (_, i) {
        return renderBlock(i);
    });
    html = html.replace(/\u0002KINLINE(\d+)\u0003/g, function (_, i) {
        return renderInline(i);
    });

    return html;
}

/* ── Markdown footnotes preprocessing ────────────────────────
   Supports standard [^label] references and [^label]: def lines.
   ─────────────────────────────────────────────────────────── */

function processFootnotes(md) {
    const defs = {};
    const usedLabels = [];

    /* Strip and collect definitions — [^label]: text (at line start) */
    let out = md.replace(
        /^\[\^([^\]]+)\]:\s*(.+)$/gm,
        function (_, label, text) {
            defs[label] = text.trim();
            return "";
        },
    );

    /* Replace references — [^label] */
    out = out.replace(/\[\^([^\]]+)\]/g, function (_, label) {
        let idx = usedLabels.indexOf(label);
        if (idx === -1) {
            usedLabels.push(label);
            idx = usedLabels.length - 1;
        }
        const n = idx + 1;
        return (
            '<sup><a href="#fn-' +
            label +
            '" id="fnref-' +
            label +
            '" class="footnote-ref" aria-label="Footnote ' +
            n +
            '">[' +
            n +
            "]</a></sup>"
        );
    });

    return { processed: out, defs: defs, usedLabels: usedLabels };
}

function buildFootnotesHTML(defs, usedLabels) {
    if (!usedLabels.length) return "";
    const items = usedLabels.map(function (label) {
        return (
            '<li id="fn-' +
            label +
            '" class="footnote-item">' +
            '<span class="footnote-text">' +
            (defs[label] || "") +
            "</span>" +
            '<a href="#fnref-' +
            label +
            '" class="footnote-back" title="Return to text">&#8617;</a>' +
            "</li>"
        );
    });
    return (
        '<section class="footnotes" aria-label="Footnotes">' +
        '<hr class="footnotes-rule">' +
        '<ol class="footnotes-list">' +
        items.join("") +
        "</ol>" +
        "</section>"
    );
}

/* ── First image extractor ────────────────────────────── */

function extractFirstMdImage(md) {
    const m = md.match(/!\[.*?\]\(([^\s)]+)/);
    return m ? m[1].trim() : null;
}

/* ══════════════════════════════════════════════════════════
   BIBTEX MODAL — shared cite popup for all publication cards
   ══════════════════════════════════════════════════════════ */

function ensureBibtexModal() {
    if (document.getElementById("bibtex-modal")) return;

    const overlay = document.createElement("div");
    overlay.id = "bibtex-modal";
    overlay.className = "bibtex-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "BibTeX citation");
    overlay.setAttribute("hidden", "");

    overlay.innerHTML =
        '<div class="bibtex-modal-box">' +
        '<button class="bibtex-modal-close" aria-label="Close" type="button">\u2715</button>' +
        '<h3 class="bibtex-modal-title">\u2726 Cite this paper</h3>' +
        '<textarea class="bibtex-modal-textarea" readonly spellcheck="false" aria-label="BibTeX entry"></textarea>' +
        '<div class="bibtex-modal-actions">' +
        '<button class="bibtex-modal-copy" type="button"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copy BibTeX</button>' +
        "</div></div>";

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector(".bibtex-modal-close");
    const textarea = overlay.querySelector(".bibtex-modal-textarea");
    const copyBtn = overlay.querySelector(".bibtex-modal-copy");

    function closeModal() {
        overlay.setAttribute("hidden", "");
        overlay.classList.remove("bibtex-modal--open");
    }

    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !overlay.hasAttribute("hidden")) closeModal();
    });

    copyBtn.addEventListener("click", function () {
        const text = textarea.value;
        const doSuccess = function () {
            copyBtn.innerHTML =
                '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied!';
            copyBtn.classList.add("copied");
            setTimeout(function () {
                copyBtn.innerHTML =
                    '<i class="fa-regular fa-copy" aria-hidden="true"></i> Copy BibTeX';
                copyBtn.classList.remove("copied");
            }, 2200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(doSuccess)
                .catch(function () {});
        } else {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.cssText = "position:fixed;opacity:0;";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                doSuccess();
            } catch (e2) {}
        }
    });
}

function openBibtexModal(bibtex, title) {
    ensureBibtexModal();
    const overlay = document.getElementById("bibtex-modal");
    const textarea = overlay.querySelector(".bibtex-modal-textarea");
    const copyBtn = overlay.querySelector(".bibtex-modal-copy");
    const titleEl = overlay.querySelector(".bibtex-modal-title");

    textarea.value = bibtex;
    if (titleEl && title) titleEl.textContent = "\u2726 " + title;
    copyBtn.innerHTML =
        '<i class="fa-regular fa-copy" aria-hidden="true"></i> Copy BibTeX';
    copyBtn.classList.remove("copied");
    overlay.removeAttribute("hidden");
    overlay.classList.add("bibtex-modal--open");
    setTimeout(function () {
        textarea.focus();
        textarea.select();
    }, 60);
}

/* ══════════════════════════════════════════════════════════
   PUBLICATIONS PAGE
   ══════════════════════════════════════════════════════════ */

async function fetchPublications() {
    const PUBS_PER_PAGE = 6;

    const container = document.getElementById("paperList");
    if (!container) return;

    showSkeleton(container, "paper", 3);

    try {
        const response = await fetch("/data/publications.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        container.innerHTML = "";

        if (data.length === 0) {
            const p = document.createElement("p");
            p.style.cssText =
                "text-decoration:none;color:#bdc2d3;font-family:Inconsolata;font-size:20px;display:flex;align-items:center;justify-content:center;";
            p.textContent = "No Publications Yet";
            const wrap = document.createElement("div");
            wrap.classList.add("paper");
            wrap.appendChild(p);
            container.appendChild(wrap);
            return;
        }

        const fullName = "Mohammed Khalil";
        const regex = new RegExp("\\b" + fullName + "\\b", "g");
        const replacement =
            '<span style="color:#ae6de3;font-weight:bold;">' +
            fullName +
            "</span>";

        /* ── Pagination state ── */
        const state = { page: 1 };

        /* ── Pagination element ── */
        const paginationEl = document.createElement("nav");
        paginationEl.className = "blog-pagination";
        paginationEl.setAttribute("aria-label", "Publications page navigation");

        /* ── Build publication cards ── */
        const pubCards = [];

        const frag = document.createDocumentFragment();
        data.forEach((paper, idx) => {
            const paperUrl = paper.url || "#";
            const div = document.createElement("div");
            div.classList.add("paper");

            /* ── Title ──────────────────────────────────────── */
            const h3 = document.createElement("h3");
            const a = document.createElement("a");
            a.classList.add("paper-name");
            a.href = paperUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = paper.name;
            h3.appendChild(a);
            div.appendChild(h3);

            /* ── Meta row: date · venue · citation count ─────── */
            const metaRow = document.createElement("div");
            metaRow.classList.add("paper-meta-row");

            if (paper.date) {
                const d = new Date(paper.date + "T00:00:00");
                const dateSpan = document.createElement("span");
                dateSpan.classList.add("blog-date");
                dateSpan.textContent = d.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                });
                metaRow.appendChild(dateSpan);
            }
            if (paper.tag) {
                const tag = document.createElement("span");
                tag.classList.add("blog-tag-pill");
                tag.textContent = paper.tag;
                metaRow.appendChild(tag);
            }
            if (typeof paper.citations === "number") {
                const citeBadge = document.createElement("span");
                citeBadge.classList.add("pub-citation-badge");
                const count = paper.citations;
                const countStr =
                    count >= 1000
                        ? "+" + (count / 1000).toFixed(1) + "k"
                        : count;
                citeBadge.innerHTML =
                    '<i class="fa-solid fa-quote-left" aria-hidden="true"></i> ' +
                    countStr +
                    "\u00a0" +
                    (count === 1 ? "citation" : "citations");
                metaRow.appendChild(citeBadge);
            }
            div.appendChild(metaRow);

            /* ── Authors ─────────────────────────────────────── */
            const info = document.createElement("p");
            info.classList.add("paper-info");
            info.innerHTML = (paper["other"] || "").replace(regex, replacement);
            div.appendChild(info);

            /* ── Footer: abstract toggle + cite button ───────── */
            const footer = document.createElement("div");
            footer.classList.add("paper-footer");

            if (paper.abstract) {
                const abstractBody = document.createElement("p");
                abstractBody.classList.add("paper-abstract-body");
                abstractBody.textContent = paper.abstract;
                abstractBody.hidden = true;

                const abstractBtn = document.createElement("button");
                abstractBtn.type = "button";
                abstractBtn.classList.add("paper-abstract-btn");
                abstractBtn.setAttribute("aria-expanded", "false");
                abstractBtn.setAttribute(
                    "aria-label",
                    "Toggle abstract for " + paper.name,
                );
                abstractBtn.innerHTML =
                    '<i class="fa-solid fa-book-open" aria-hidden="true"></i> Abstract <span class="paper-abstract-chevron" aria-hidden="true">\u25be</span>';

                abstractBtn.addEventListener("click", function () {
                    const isOpen = !abstractBody.hidden;
                    abstractBody.hidden = isOpen;
                    abstractBtn.setAttribute("aria-expanded", String(!isOpen));
                    abstractBtn.classList.toggle(
                        "paper-abstract-btn--open",
                        !isOpen,
                    );
                });

                footer.appendChild(abstractBtn);
                div.appendChild(footer);
                div.appendChild(abstractBody);
            } else {
                div.appendChild(footer);
            }

            if (paper.bibtex) {
                const citeBtn = document.createElement("button");
                citeBtn.type = "button";
                citeBtn.classList.add("paper-cite-btn");
                citeBtn.innerHTML =
                    '<i class="fa-solid fa-quote-right" aria-hidden="true"></i> Cite';
                citeBtn.setAttribute(
                    "aria-label",
                    "Show BibTeX for " + paper.name,
                );
                citeBtn.addEventListener("click", function () {
                    openBibtexModal(paper.bibtex, paper.name);
                });
                footer.appendChild(citeBtn);
            }

            /* ── ScholarlyArticle JSON-LD ────────────────────── */
            if (paper.name && paper.url) {
                const ldScript = document.createElement("script");
                ldScript.type = "application/ld+json";
                const ldAuthors = (paper["other"] || "")
                    .split(",")
                    .map(function (n) {
                        return { "@type": "Person", name: n.trim() };
                    });
                ldScript.textContent = JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "ScholarlyArticle",
                    name: paper.name,
                    author: ldAuthors,
                    datePublished: paper.date || "",
                    url: paper.url,
                    isPartOf: paper.tag
                        ? { "@type": "PublicationEvent", name: paper.tag }
                        : undefined,
                });
                div.appendChild(ldScript);
            }

            frag.appendChild(div);
            pubCards.push({ el: div });
        });
        container.appendChild(frag);
        container.parentNode.insertBefore(paginationEl, container.nextSibling);

        /* ── Pagination renderer ── */
        function renderPagination(totalItems, currentPage) {
            paginationEl.innerHTML = "";
            const totalPages = Math.ceil(totalItems / PUBS_PER_PAGE);
            if (totalPages <= 1) return;

            function goToPage(pg) {
                container.classList.add("paper-div--fading");
                setTimeout(function () {
                    state.page = pg;
                    applyPage();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    requestAnimationFrame(function () {
                        container.classList.remove("paper-div--fading");
                    });
                }, 200);
            }

            function makePgNum(pg) {
                const btn = document.createElement("button");
                btn.type = "button";
                const isActive = pg === currentPage;
                btn.className =
                    "blog-pg-btn" + (isActive ? " blog-pg-btn--active" : "");
                btn.textContent = pg;
                btn.setAttribute("aria-label", "Page " + pg);
                if (isActive) btn.setAttribute("aria-current", "page");
                if (!isActive)
                    btn.addEventListener("click", function () {
                        goToPage(pg);
                    });
                return btn;
            }

            function makeEllipsis() {
                const s = document.createElement("span");
                s.className = "blog-pg-ellipsis";
                s.textContent = "…";
                s.setAttribute("aria-hidden", "true");
                return s;
            }

            const prevBtn = document.createElement("button");
            prevBtn.type = "button";
            prevBtn.className =
                "blog-pg-btn blog-pg-btn--arrow" +
                (currentPage === 1 ? " blog-pg-btn--disabled" : "");
            prevBtn.disabled = currentPage === 1;
            prevBtn.setAttribute("aria-label", "Previous page");
            prevBtn.innerHTML =
                '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>Prev</span>';
            if (currentPage > 1)
                prevBtn.addEventListener("click", function () {
                    goToPage(currentPage - 1);
                });
            paginationEl.appendChild(prevBtn);

            if (totalPages <= 5) {
                for (let i = 1; i <= totalPages; i++)
                    paginationEl.appendChild(makePgNum(i));
            } else {
                const winStart = Math.max(2, currentPage - 1);
                const winEnd = Math.min(totalPages - 1, currentPage + 1);
                paginationEl.appendChild(makePgNum(1));
                if (winStart > 2) paginationEl.appendChild(makeEllipsis());
                for (let i = winStart; i <= winEnd; i++)
                    paginationEl.appendChild(makePgNum(i));
                if (winEnd < totalPages - 1)
                    paginationEl.appendChild(makeEllipsis());
                paginationEl.appendChild(makePgNum(totalPages));
            }

            const nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.className =
                "blog-pg-btn blog-pg-btn--arrow" +
                (currentPage === totalPages ? " blog-pg-btn--disabled" : "");
            nextBtn.disabled = currentPage === totalPages;
            nextBtn.setAttribute("aria-label", "Next page");
            nextBtn.innerHTML =
                '<span>Next</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
            if (currentPage < totalPages)
                nextBtn.addEventListener("click", function () {
                    goToPage(currentPage + 1);
                });
            paginationEl.appendChild(nextBtn);
        }

        /* ── Show only the current page of cards ── */
        let pubInitialRender = true;
        function applyPage() {
            const start = (state.page - 1) * PUBS_PER_PAGE;
            const end = start + PUBS_PER_PAGE;
            pubCards.forEach(function (card, idx) {
                const inPage = idx >= start && idx < end;
                card.el.classList.toggle("blog-post--hidden", !inPage);
                if (
                    !pubInitialRender &&
                    inPage &&
                    !card.el.classList.contains("revealed")
                ) {
                    card.el.style.transitionDelay = "";
                    card.el.classList.add("revealed");
                }
            });
            renderPagination(pubCards.length, state.page);
        }

        applyPage();
        pubInitialRender = false;
    } catch (e) {
        container.innerHTML =
            '<p style="color:#707070;font-family:Noto,sans-serif;font-size:16px;text-align:center;padding:40px 0;">Could not load publications.</p>';
    }
}

/* ══════════════════════════════════════════════════════════
   PROJECTS PAGE
   ══════════════════════════════════════════════════════════ */

async function fetchProjects() {
    const container = document.getElementById("projects-container");
    if (!container) return;

    try {
        const response = await fetch("/data/OtherProjects.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        const frag = document.createDocumentFragment();
        data.forEach((project) => {
            const projectUrl = project.url || "#";
            const div = document.createElement("div");
            div.classList.add("small");

            const folder = document.createElement("img");
            folder.classList.add("folder");
            folder.src = "./src/images/other_icons/folder.png";
            folder.alt = "Folder icon";
            folder.loading = "lazy";

            const titleLink = document.createElement("a");
            titleLink.href = projectUrl;
            titleLink.target = "_blank";
            titleLink.rel = "noopener noreferrer";
            titleLink.classList.add("proj-name");
            titleLink.textContent = project.title;

            const desc = document.createElement("p");
            desc.classList.add("p-proj");
            desc.textContent = project.container;

            const techWrapper = document.createElement("div");
            techWrapper.classList.add("tech-icons");

            const fwImg = document.createElement("img");
            fwImg.src = project.imageSrc;
            fwImg.alt = project.imageAlt;
            fwImg.loading = "lazy";
            techWrapper.appendChild(fwImg);

            div.appendChild(folder);
            div.appendChild(titleLink);
            div.appendChild(desc);
            div.appendChild(techWrapper);
            frag.appendChild(div);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML =
            '<p style="color:#707070;font-family:Noto,sans-serif;font-size:16px;text-align:center;padding:40px 0;">Could not load projects.</p>';
    }
}

async function fetchMeanProjects() {
    const container = document.getElementById("meanProjectsList");
    if (!container) return;

    try {
        const response = await fetch("/data/MeanProject.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        if (data.length === 0) {
            container.innerHTML =
                '<p style="text-align:center;color:#7a7694;font-family:Raleway,sans-serif;font-size:16px;margin:60px 0;">No featured projects yet.</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        data.forEach((project, index) => {
            const card = document.createElement("div");
            card.className =
                "mp-card" + (index % 2 !== 0 ? " mp-card--alt" : "");

            const imgWrap = document.createElement("div");
            imgWrap.className = "mp-card__img-wrap";

            const img = document.createElement("img");
            img.className = "mp-card__img";
            img.src = project.image;
            img.alt = project.imageAlt;
            img.loading = "lazy";

            imgWrap.appendChild(img);

            const body = document.createElement("div");
            body.className = "mp-card__body";

            const title = document.createElement("h2");
            title.className = "mp-card__title";
            title.textContent = project.title;

            const desc = document.createElement("p");
            desc.className = "mp-card__desc";
            desc.textContent = project.description;

            const stack = document.createElement("div");
            stack.className = "mp-card__stack";
            const stackImg = document.createElement("img");
            stackImg.src = project.frameworks;
            stackImg.alt = project.frameworksAlt;
            stackImg.loading = "lazy";
            stack.appendChild(stackImg);

            const links = document.createElement("div");
            links.className = "mp-card__links";

            const ghLink = document.createElement("a");
            ghLink.href = project.githubUrl;
            ghLink.target = "_blank";
            ghLink.rel = "noopener noreferrer";
            ghLink.className = "mp-card__link";
            ghLink.innerHTML =
                '<i class="fab fa-github" aria-hidden="true"></i> GitHub';

            const extLink = document.createElement("a");
            extLink.href = project.externalUrl;
            extLink.target = "_blank";
            extLink.rel = "noopener noreferrer";
            extLink.className = "mp-card__link mp-card__link--ext";
            extLink.innerHTML =
                '<i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i> View';

            links.appendChild(ghLink);
            links.appendChild(extLink);

            body.appendChild(title);
            body.appendChild(desc);
            body.appendChild(stack);
            body.appendChild(links);

            card.appendChild(imgWrap);
            card.appendChild(body);

            frag.appendChild(card);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML =
            '<p style="text-align:center;color:#7a7694;font-family:Raleway,sans-serif;font-size:16px;margin:60px 0;">Could not load featured projects.</p>';
    }
}

async function fetchDatasets() {
    const container = document.getElementById("datasetList");
    if (!container) return;

    try {
        const response = await fetch("/data/datasets.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        if (data.length === 0) {
            container.innerHTML =
                '<p style="color:#7a7694;font-family:Raleway,sans-serif;font-size:16px;padding:40px 20px;">No datasets available.</p>';
            return;
        }

        const frag = document.createDocumentFragment();
        data.forEach((dataset) => {
            const card = document.createElement("div");
            card.className = "ds-tile";

            const thumb = document.createElement("div");
            thumb.className = "ds-tile__thumb";

            const img = document.createElement("img");
            img.src = dataset.image;
            img.alt = dataset.name;
            img.loading = "lazy";
            thumb.appendChild(img);

            const badge = document.createElement("span");
            badge.className = "ds-tile__badge";
            badge.textContent = dataset.tag || "Dataset";
            thumb.appendChild(badge);

            const body = document.createElement("div");
            body.className = "ds-tile__body";

            const title = document.createElement("h3");
            title.className = "ds-tile__title";

            const titleLink = document.createElement("a");
            titleLink.href = dataset.url;
            titleLink.target = "_blank";
            titleLink.rel = "noopener noreferrer";
            titleLink.textContent = dataset.name;
            title.appendChild(titleLink);

            const desc = document.createElement("p");
            desc.className = "ds-tile__desc";
            desc.textContent = dataset.container;

            const hf = document.createElement("span");
            hf.className = "ds-tile__hf";
            hf.innerHTML =
                '<i class="fas fa-database" aria-hidden="true"></i> HuggingFace';

            body.appendChild(title);
            body.appendChild(desc);
            body.appendChild(hf);

            card.appendChild(thumb);
            card.appendChild(body);
            frag.appendChild(card);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML =
            '<p style="color:#707070;font-family:Raleway,sans-serif;font-size:16px;padding:40px 20px;">Could not load datasets.</p>';
    }
}

/* ══════════════════════════════════════════════════════════
   SOCIAL LINKS (footer / contact section)
   ══════════════════════════════════════════════════════════ */

async function fetchSocial() {
    const container = document.getElementById("socialLinks");
    if (!container) return;

    try {
        const response = await fetch("/data/social.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        const frag = document.createDocumentFragment();
        data.forEach((item) => {
            const link = document.createElement("a");
            link.href = item.url;
            if (item.target) {
                link.target = item.target;
                link.rel = "noopener noreferrer";
            }
            link.classList.add("img-bac");
            if (item.alt) {
                link.title = item.alt;
                link.setAttribute("aria-label", item.alt);
            }

            const img = document.createElement("img");
            img.classList.add("icon");
            img.src = item.icon;
            img.alt = item.alt;
            img.loading = "lazy";

            link.appendChild(img);
            frag.appendChild(link);
        });
        container.appendChild(frag);
    } catch (e) {}
}

/* ══════════════════════════════════════════════════════════
   BLOG LISTING PAGE
   ══════════════════════════════════════════════════════════ */

async function fetchBlogs() {
    const POSTS_PER_PAGE = 6;

    const container = document.getElementById("blogList");
    if (!container) return;

    showSkeleton(container, "paper", 3);

    try {
        const response = await fetch("/data/blogs.json", { cache: "default" });
        const data = await response.json();

        container.innerHTML = "";

        if (data.length === 0) {
            const p = document.createElement("p");
            p.style.cssText =
                "text-decoration:none;color:#bdc2d3;font-family:Inconsolata;font-size:20px;display:flex;align-items:center;justify-content:center;";
            p.textContent = "No posts yet.";
            const wrap = document.createElement("div");
            wrap.classList.add("paper");
            wrap.appendChild(p);
            container.appendChild(wrap);
            return;
        }

        /* ── Shared filter + page state ──────────────────────── */
        const state = { tags: new Set(), query: "", page: 1 };
        let applyFilter = null;

        /* ── "No results" empty-state element ────────────────── */
        const noResults = document.createElement("p");
        noResults.className = "blog-no-results";
        noResults.setAttribute("aria-live", "polite");

        /* ── Count label ──────────────────────────────────────── */
        const countEl = document.createElement("p");
        countEl.className = "blog-filter-count";
        countEl.style.display = "none";

        /* ── Pagination element ───────────────────────────────── */
        const paginationEl = document.createElement("nav");
        paginationEl.className = "blog-pagination";
        paginationEl.setAttribute("aria-label", "Blog page navigation");

        /* ── Build post cards ─────────────────────────────────── */
        const postCards = [];

        const frag = document.createDocumentFragment();
        data.forEach((post, idx) => {
            const postUrl = getPostUrl(post.file.replace(/\.md$/, ""));
            const div = document.createElement("div");
            div.classList.add("paper");

            const blogInner = document.createElement("div");
            blogInner.classList.add("blog-list-inner");

            const thumbPlaceholder = document.createElement("div");
            thumbPlaceholder.classList.add("blog-list-thumb-placeholder");
            thumbPlaceholder.innerHTML =
                '<i class="fa-regular fa-newspaper" aria-hidden="true"></i>';

            const blogBody = document.createElement("div");
            blogBody.classList.add("blog-list-body");

            const h3 = document.createElement("h3");
            const titleLink = document.createElement("a");
            titleLink.classList.add("paper-name");
            titleLink.href = postUrl;
            titleLink.textContent = post.title;
            h3.appendChild(titleLink);

            const metaRow = document.createElement("div");
            metaRow.classList.add("paper-meta-row");

            if (post.date) {
                const d = new Date(post.date + "T00:00:00");
                const dateSpan = document.createElement("span");
                dateSpan.classList.add("blog-date");
                dateSpan.textContent = d.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                });
                metaRow.appendChild(dateSpan);
            }

            if (post.series) {
                const seriesPill = document.createElement("span");
                seriesPill.classList.add("blog-series-pill");
                seriesPill.title = post.series.name;
                seriesPill.innerHTML =
                    '<i class="fa-solid fa-layer-group" aria-hidden="true"></i> Part ' +
                    post.series.part +
                    " of " +
                    post.series.total;
                metaRow.appendChild(seriesPill);
            }

            (post.tags || []).forEach((tag) => {
                const pill = document.createElement("span");
                pill.classList.add("blog-tag-pill", "blog-tag-pill--clickable");
                pill.textContent = tag;
                pill.setAttribute("role", "button");
                pill.setAttribute("tabindex", "0");
                pill.setAttribute("aria-label", "Filter by " + tag);
                pill.addEventListener("click", function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (state.tags.has(tag)) state.tags.delete(tag); else state.tags.add(tag);
                    state.page = 1;
                    if (applyFilter) applyFilter();
                });
                pill.addEventListener("keydown", function (e) {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (state.tags.has(tag)) state.tags.delete(tag); else state.tags.add(tag);
                        state.page = 1;
                        if (applyFilter) applyFilter();
                    }
                });
                metaRow.appendChild(pill);
            });

            const rt = document.createElement("span");
            rt.classList.add("blog-reading-time");
            rt.textContent = post.readingTime
                ? post.readingTime + " min read"
                : "";
            metaRow.appendChild(rt);

            fetch("/data/blogs/" + post.file, { cache: "default" })
                .then(function (r) {
                    return r.text();
                })
                .then(function (md) {
                    rt.textContent = calcReadingTime(md) + " min read";
                    const imgSrc = extractFirstMdImage(md);
                    if (imgSrc) {
                        const thumb = document.createElement("img");
                        thumb.classList.add("blog-list-thumb");
                        thumb.src = imgSrc;
                        thumb.alt = post.title;
                        thumb.loading = "lazy";
                        thumb.onerror = function () {
                            if (thumb.parentNode)
                                thumb.parentNode.replaceChild(
                                    thumbPlaceholder,
                                    thumb,
                                );
                        };
                        if (thumbPlaceholder.parentNode)
                            thumbPlaceholder.parentNode.replaceChild(
                                thumb,
                                thumbPlaceholder,
                            );
                    }
                })
                .catch(function () {});

            const desc = document.createElement("p");
            desc.classList.add("paper-info");
            desc.textContent = post.description;

            blogBody.appendChild(h3);
            blogBody.appendChild(metaRow);
            blogBody.appendChild(desc);
            blogInner.appendChild(thumbPlaceholder);
            blogInner.appendChild(blogBody);
            div.appendChild(blogInner);
            frag.appendChild(div);

            postCards.push({
                el: div,
                tags: post.tags || [],
                title: post.title,
                description: post.description || "",
            });
        });
        container.appendChild(frag);
        container.appendChild(noResults);
        container.parentNode.insertBefore(paginationEl, container.nextSibling);

        /* ── Tag filter bar ───────────────────────────────────── */
        const filterBar = document.getElementById("tagFilters");
        if (!filterBar) return;

        const allTags = [];
        data.forEach(function (post) {
            (post.tags || []).forEach(function (tag) {
                if (!allTags.includes(tag)) allTags.push(tag);
            });
        });

        /* ── Initialise tag from URL (?tag=nlp) ──────────────── */
        try {
            const urlTag = new URLSearchParams(window.location.search).get("tag");
            if (urlTag && allTags.includes(urlTag)) state.tags.add(urlTag);
            const urlTags = new URLSearchParams(window.location.search).get("tags");
            if (urlTags) {
                urlTags.split(",").forEach(function (t) {
                    if (allTags.includes(t)) state.tags.add(t);
                });
            }
        } catch (e) {}

        if (allTags.length > 0) {
            const barFrag = document.createDocumentFragment();

            const allBtn = document.createElement("button");
            allBtn.classList.add("tag-filter-btn", "tag-filter-btn--active");
            allBtn.textContent = "All";
            allBtn.dataset.tag = "";
            allBtn.setAttribute("aria-pressed", "true");
            allBtn.addEventListener("click", function () {
                state.tags.clear();
                state.page = 1;
                if (applyFilter) applyFilter();
            });
            barFrag.appendChild(allBtn);

            allTags.forEach(function (tag) {
                const btn = document.createElement("button");
                btn.classList.add("tag-filter-btn");
                btn.textContent = tag;
                btn.dataset.tag = tag;
                btn.setAttribute("aria-pressed", "false");
                btn.addEventListener("click", function () {
                    if (state.tags.has(tag)) state.tags.delete(tag); else state.tags.add(tag);
                    state.page = 1;
                    if (applyFilter) applyFilter();
                });
                barFrag.appendChild(btn);
            });

            filterBar.appendChild(barFrag);
            filterBar.insertAdjacentElement("afterend", countEl);
        }

        /* ── Search input ─────────────────────────────────────── */
        const searchInput = document.getElementById("blogSearchInput");
        if (searchInput) {
            searchInput.addEventListener("input", function () {
                state.query = this.value.trim().toLowerCase();
                state.page = 1;
                if (applyFilter) applyFilter();
            });
        }

        /* ── Initialise search from URL (?search=query) ───────── */
        try {
            const urlSearch = new URLSearchParams(window.location.search).get(
                "search",
            );
            if (urlSearch) {
                state.query = urlSearch.trim().toLowerCase();
                if (searchInput) searchInput.value = urlSearch.trim();
            }
        } catch (e) {}

        /* ── Pagination renderer ──────────────────────────────── */
        function renderPagination(totalItems, currentPage) {
            paginationEl.innerHTML = "";
            const totalPages = Math.ceil(totalItems / POSTS_PER_PAGE);
            if (totalPages <= 1) return;

            function goToPage(pg) {
                container.classList.add("paper-div--fading");
                setTimeout(function () {
                    state.page = pg;
                    applyFilter();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    requestAnimationFrame(function () {
                        container.classList.remove("paper-div--fading");
                    });
                }, 200);
            }

            function makePgNum(pg) {
                const btn = document.createElement("button");
                btn.type = "button";
                const isActive = pg === currentPage;
                btn.className =
                    "blog-pg-btn" + (isActive ? " blog-pg-btn--active" : "");
                btn.textContent = pg;
                btn.setAttribute("aria-label", "Page " + pg);
                if (isActive) btn.setAttribute("aria-current", "page");
                if (!isActive)
                    btn.addEventListener("click", function () {
                        goToPage(pg);
                    });
                return btn;
            }

            function makeEllipsis() {
                const s = document.createElement("span");
                s.className = "blog-pg-ellipsis";
                s.textContent = "…";
                s.setAttribute("aria-hidden", "true");
                return s;
            }

            /* ── Prev ── */
            const prevBtn = document.createElement("button");
            prevBtn.type = "button";
            prevBtn.className =
                "blog-pg-btn blog-pg-btn--arrow" +
                (currentPage === 1 ? " blog-pg-btn--disabled" : "");
            prevBtn.disabled = currentPage === 1;
            prevBtn.setAttribute("aria-label", "Previous page");
            prevBtn.innerHTML =
                '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>Prev</span>';
            if (currentPage > 1)
                prevBtn.addEventListener("click", function () {
                    goToPage(currentPage - 1);
                });
            paginationEl.appendChild(prevBtn);

            /* ── Page numbers: always show 5 numbered buttons + ellipsis ── *
             *  Pattern:  1  …  cur-1  cur  cur+1  …  N
             *  Short (≤5 pages): show all numbers, no ellipsis              */
            if (totalPages <= 5) {
                for (let i = 1; i <= totalPages; i++)
                    paginationEl.appendChild(makePgNum(i));
            } else {
                /* Window of 3 around current, plus always-visible first/last */
                const winStart = Math.max(2, currentPage - 1);
                const winEnd = Math.min(totalPages - 1, currentPage + 1);

                paginationEl.appendChild(makePgNum(1));

                if (winStart > 2) paginationEl.appendChild(makeEllipsis());

                for (let i = winStart; i <= winEnd; i++)
                    paginationEl.appendChild(makePgNum(i));

                if (winEnd < totalPages - 1)
                    paginationEl.appendChild(makeEllipsis());

                paginationEl.appendChild(makePgNum(totalPages));
            }

            /* ── Next ── */
            const nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.className =
                "blog-pg-btn blog-pg-btn--arrow" +
                (currentPage === totalPages ? " blog-pg-btn--disabled" : "");
            nextBtn.disabled = currentPage === totalPages;
            nextBtn.setAttribute("aria-label", "Next page");
            nextBtn.innerHTML =
                '<span>Next</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';
            if (currentPage < totalPages)
                nextBtn.addEventListener("click", function () {
                    goToPage(currentPage + 1);
                });
            paginationEl.appendChild(nextBtn);
        }

        /* ── Filter + paginate function ───────────────────────── */
        let blogInitialRender = true;
        applyFilter = function () {
            const activeTags = state.tags;
            const q = state.query;
            const isFiltered = activeTags.size > 0 || q !== "";

            /* Cards that match the current filter */
            const matched = postCards.filter(function (card) {
                const matchTag = activeTags.size === 0 || card.tags.some(function (t) { return activeTags.has(t); });
                const matchSearch =
                    q === "" ||
                    card.title.toLowerCase().includes(q) ||
                    card.description.toLowerCase().includes(q);
                return matchTag && matchSearch;
            });

            /* Clamp page so it never exceeds available pages */
            const totalPages = Math.max(
                1,
                Math.ceil(matched.length / POSTS_PER_PAGE),
            );
            if (state.page > totalPages) state.page = totalPages;

            /* Show only the current page of matched cards; hide everything else */
            const start = (state.page - 1) * POSTS_PER_PAGE;
            const end = start + POSTS_PER_PAGE;
            postCards.forEach(function (card) {
                const matchIdx = matched.indexOf(card);
                const inPage = matchIdx >= start && matchIdx < end;
                card.el.classList.toggle("blog-post--hidden", !inPage);
                if (
                    !blogInitialRender &&
                    inPage &&
                    !card.el.classList.contains("revealed")
                ) {
                    card.el.style.transitionDelay = "";
                    card.el.classList.add("revealed");
                }
            });

            /* Pagination — always render (applies to both filtered and unfiltered sets) */
            renderPagination(matched.length, state.page);

            /* Count label (only when a filter is active) */
            if (isFiltered) {
                const visible = matched.length;
                const total = postCards.length;
                countEl.textContent =
                    visible === total
                        ? total + (total === 1 ? " post" : " posts")
                        : visible +
                          " of " +
                          total +
                          (total === 1 ? " post" : " posts");
                countEl.style.display = "block";
            } else {
                countEl.style.display = "none";
            }

            /* Empty state */
            if (matched.length === 0) {
                const hint = [];
                if (q) hint.push("\u201c" + q + "\u201d");
                if (activeTags.size > 0) hint.push("tag" + (activeTags.size > 1 ? "s" : "") + " \u201c" + Array.from(activeTags).join("\u201d, \u201c") + "\u201d");
                noResults.textContent =
                    "No posts found" +
                    (hint.length ? " for " + hint.join(" with ") : "") +
                    ".";
                noResults.classList.add("visible");
            } else {
                noResults.classList.remove("visible");
            }

            /* Tag filter buttons */
            filterBar
                .querySelectorAll(".tag-filter-btn")
                .forEach(function (btn) {
                    const isAll = btn.dataset.tag === "";
                    const isActive = isAll ? activeTags.size === 0 : activeTags.has(btn.dataset.tag);
                    btn.classList.toggle("tag-filter-btn--active", isActive);
                    btn.setAttribute(
                        "aria-pressed",
                        isActive ? "true" : "false",
                    );
                });

            /* Sync URL so tag + search are shareable and bookmarkable */
            try {
                if (history.replaceState) {
                    const params = new URLSearchParams();
                    if (activeTags.size > 0) params.set("tags", Array.from(activeTags).join(","));
                    if (q) params.set("search", q);
                    const qs = params.toString();
                    history.replaceState(
                        null,
                        "",
                        window.location.pathname + (qs ? "?" + qs : ""),
                    );
                }
            } catch (e) {}

            /* Clickable pills inside post cards */
            container
                .querySelectorAll(".blog-tag-pill--clickable")
                .forEach(function (pill) {
                    pill.classList.toggle(
                        "blog-tag-pill--active",
                        activeTags.has(pill.textContent),
                    );
                });
        };

        /* ── Initial render ───────────────────────────────────── */
        applyFilter();
        blogInitialRender = false;

        /* ── Save filter state when clicking a post link ─────── */
        container.addEventListener("click", function (e) {
            const a = e.target.closest("a.paper-name");
            if (a) {
                try {
                    sessionStorage.setItem(
                        "blogFilterState",
                        JSON.stringify({
                            tags: Array.from(state.tags),
                            query: state.query,
                            page: state.page,
                        }),
                    );
                } catch (err) {}
            }
        });

        /* ── Restore filter state when returning from a post ─── */
        try {
            const saved = sessionStorage.getItem("blogFilterState");
            if (saved) {
                sessionStorage.removeItem("blogFilterState");
                const savedState = JSON.parse(saved);
                if (savedState.query) {
                    state.query = savedState.query;
                    if (searchInput) searchInput.value = savedState.query;
                }
                if (Array.isArray(savedState.tags)) savedState.tags.forEach(function (t) { state.tags.add(t); });
                if (savedState.page) state.page = savedState.page;
                applyFilter();
            }
        } catch (err) {}
    } catch (e) {
        container.innerHTML =
            '<p style="color:#707070;font-family:Noto,sans-serif;font-size:16px;text-align:center;padding:40px 0;">Could not load posts.</p>';
    }
}

/* ══════════════════════════════════════════════════════════
   HOMEPAGE — CERTIFICATES CAROUSEL
   ══════════════════════════════════════════════════════════ */

async function fetchCertificates() {
    const container = document.getElementById("certificates-container");
    if (!container) return;

    try {
        const response = await fetch("/data/certificates.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        const frag = document.createDocumentFragment();
        data.forEach(function (item) {
            const div = document.createElement("div");
            div.classList.add("child");

            const img = document.createElement("img");
            img.classList.add("child-img");
            img.src = item.imagePath;
            img.alt = item.imageAlt;
            img.loading = "lazy";

            const link = document.createElement("a");
            link.href = item.certificateUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.classList.add("cert-link");
            link.textContent = item.title;

            div.appendChild(img);
            div.appendChild(link);
            frag.appendChild(div);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML = "";
    }
}

/* ══════════════════════════════════════════════════════════
   HOMEPAGE — RECENT SECTION STRIPS
   ══════════════════════════════════════════════════════════ */

async function fetchHomepageProjects() {
    const container = document.getElementById("hp-projects");
    if (!container) return;

    showSkeleton(container, "card", 2);

    try {
        const response = await fetch("/data/MeanProject.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        container.innerHTML = "";

        const frag = document.createDocumentFragment();
        data.slice(0, 2).forEach((project) => {
            const card = document.createElement("div");
            card.classList.add("recent-card");

            const inner = document.createElement("div");
            inner.classList.add("recent-card-inner");

            const thumb = document.createElement("img");
            thumb.src = project.image;
            thumb.alt = project.imageAlt;
            thumb.classList.add("recent-card-thumb");
            thumb.loading = "lazy";
            thumb.onerror = function () {
                thumb.style.display = "none";
            };

            const body = document.createElement("div");
            body.classList.add("recent-card-body");

            const titleLink = document.createElement("a");
            titleLink.classList.add("recent-card-title");
            titleLink.href = project.githubUrl;
            titleLink.target = "_blank";
            titleLink.rel = "noopener noreferrer";
            titleLink.textContent = project.title;

            const meta = document.createElement("div");
            meta.classList.add("recent-card-meta");

            (project.frameworksAlt || "")
                .split(",")
                .map(function (l) {
                    return l.trim();
                })
                .filter(Boolean)
                .forEach(function (lang) {
                    const pill = document.createElement("span");
                    pill.classList.add("blog-tag-pill");
                    pill.textContent = lang;
                    meta.appendChild(pill);
                });

            const desc = document.createElement("p");
            desc.classList.add("recent-card-desc");
            desc.textContent = project.description;

            body.appendChild(titleLink);
            body.appendChild(meta);
            body.appendChild(desc);
            inner.appendChild(thumb);
            inner.appendChild(body);
            card.appendChild(inner);
            frag.appendChild(card);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML = "";
    }
}

async function fetchHomepagePublications() {
    const container = document.getElementById("hp-publications");
    if (!container) return;

    showSkeleton(container, "card", 2);

    try {
        const response = await fetch("/data/publications.json", {
            cache: "force-cache",
        });
        const data = await response.json();

        data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        container.innerHTML = "";

        if (data.length === 0) {
            const p = document.createElement("p");
            p.style.cssText =
                "color:#707070;font-family:Noto,sans-serif;font-size:16px;";
            p.textContent = "No publications yet.";
            container.appendChild(p);
            return;
        }

        const fullName = "Mohammed Khalil";
        const regex = new RegExp("\\b" + fullName + "\\b", "g");
        const replacement =
            '<span style="color:#ae6de3;font-weight:bold;">' +
            fullName +
            "</span>";

        const frag = document.createDocumentFragment();
        data.slice(0, 2).forEach((paper) => {
            const paperUrl = paper.url || "#";
            const div = document.createElement("div");
            div.classList.add("paper");

            /* ── Title ── */
            const h3 = document.createElement("h3");
            const a = document.createElement("a");
            a.classList.add("paper-name");
            a.href = paperUrl;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = paper.name;
            h3.appendChild(a);
            div.appendChild(h3);

            /* ── Meta row: date · tag · citation badge ── */
            const metaRow = document.createElement("div");
            metaRow.classList.add("paper-meta-row");
            if (paper.date) {
                const d = new Date(paper.date + "T00:00:00");
                const dateSpan = document.createElement("span");
                dateSpan.classList.add("blog-date");
                dateSpan.textContent = d.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                });
                metaRow.appendChild(dateSpan);
            }
            if (paper.tag) {
                const tag = document.createElement("span");
                tag.classList.add("blog-tag-pill");
                tag.textContent = paper.tag;
                metaRow.appendChild(tag);
            }
            if (typeof paper.citations === "number") {
                const citeBadge = document.createElement("span");
                citeBadge.classList.add("pub-citation-badge");
                const count = paper.citations;
                const countStr =
                    count >= 1000
                        ? "+" + (count / 1000).toFixed(1) + "k"
                        : count;
                citeBadge.innerHTML =
                    '<i class="fa-solid fa-quote-left" aria-hidden="true"></i> ' +
                    countStr +
                    "\u00a0" +
                    (count === 1 ? "citation" : "citations");
                metaRow.appendChild(citeBadge);
            }
            div.appendChild(metaRow);

            /* ── Authors ── */
            const info = document.createElement("p");
            info.classList.add("paper-info");
            info.innerHTML = (paper["other"] || "").replace(regex, replacement);
            div.appendChild(info);

            /* ── Footer: abstract toggle + cite button ── */
            const footer = document.createElement("div");
            footer.classList.add("paper-footer");

            if (paper.abstract) {
                const abstractBody = document.createElement("p");
                abstractBody.classList.add("paper-abstract-body");
                abstractBody.textContent = paper.abstract;
                abstractBody.hidden = true;

                const abstractBtn = document.createElement("button");
                abstractBtn.type = "button";
                abstractBtn.classList.add("paper-abstract-btn");
                abstractBtn.setAttribute("aria-expanded", "false");
                abstractBtn.setAttribute(
                    "aria-label",
                    "Toggle abstract for " + paper.name,
                );
                abstractBtn.innerHTML =
                    '<i class="fa-solid fa-book-open" aria-hidden="true"></i> Abstract <span class="paper-abstract-chevron" aria-hidden="true">\u25be</span>';
                abstractBtn.addEventListener("click", function () {
                    const isOpen = !abstractBody.hidden;
                    abstractBody.hidden = isOpen;
                    abstractBtn.setAttribute("aria-expanded", String(!isOpen));
                    abstractBtn.classList.toggle(
                        "paper-abstract-btn--open",
                        !isOpen,
                    );
                });

                footer.appendChild(abstractBtn);
                div.appendChild(footer);
                div.appendChild(abstractBody);
            } else {
                div.appendChild(footer);
            }

            if (paper.bibtex) {
                const citeBtn = document.createElement("button");
                citeBtn.type = "button";
                citeBtn.classList.add("paper-cite-btn");
                citeBtn.innerHTML =
                    '<i class="fa-solid fa-quote-right" aria-hidden="true"></i> Cite';
                citeBtn.setAttribute(
                    "aria-label",
                    "Show BibTeX for " + paper.name,
                );
                citeBtn.addEventListener("click", function () {
                    openBibtexModal(paper.bibtex, paper.name);
                });
                footer.appendChild(citeBtn);
            }

            frag.appendChild(div);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML = "";
    }
}

async function fetchHomepageBlogs() {
    const container = document.getElementById("hp-blogs");
    if (!container) return;

    showSkeleton(container, "card", 2);

    try {
        const response = await fetch("/data/blogs.json", { cache: "default" });
        const data = await response.json();

        container.innerHTML = "";

        if (data.length === 0) {
            const p = document.createElement("p");
            p.style.cssText =
                "color:#707070;font-family:Noto,sans-serif;font-size:16px;";
            p.textContent = "No articles yet.";
            container.appendChild(p);
            return;
        }

        const frag = document.createDocumentFragment();
        data.slice(0, 2).forEach((post) => {
            const postUrl = getPostUrl(post.file.replace(/\.md$/, ""));
            const card = document.createElement("div");
            card.classList.add("recent-card");

            const inner = document.createElement("div");
            inner.classList.add("recent-card-inner");

            const thumbPlaceholder = document.createElement("div");
            thumbPlaceholder.classList.add(
                "recent-card-thumb",
                "blog-thumb-placeholder",
            );
            thumbPlaceholder.innerHTML =
                '<i class="fa-regular fa-newspaper" aria-hidden="true"></i>';

            const body = document.createElement("div");
            body.classList.add("recent-card-body");

            const titleLink = document.createElement("a");
            titleLink.classList.add("recent-card-title");
            titleLink.href = postUrl;
            titleLink.textContent = post.title;

            const meta = document.createElement("div");
            meta.classList.add("recent-card-meta");

            if (post.date) {
                const d = new Date(post.date + "T00:00:00");
                const dateSpan = document.createElement("span");
                dateSpan.classList.add("blog-date");
                dateSpan.textContent = d.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                });
                meta.appendChild(dateSpan);
            }

            if (post.series) {
                const seriesPill = document.createElement("span");
                seriesPill.classList.add("blog-series-pill");
                seriesPill.title = post.series.name;
                seriesPill.innerHTML =
                    '<i class="fa-solid fa-layer-group" aria-hidden="true"></i> Part ' +
                    post.series.part +
                    " of " +
                    post.series.total;
                meta.appendChild(seriesPill);
            }

            (post.tags || []).forEach(function (tag) {
                const pill = document.createElement("span");
                pill.classList.add("blog-tag-pill");
                pill.textContent = tag;
                meta.appendChild(pill);
            });

            const rt = document.createElement("span");
            rt.classList.add("blog-reading-time");
            rt.textContent = post.readingTime
                ? post.readingTime + " min read"
                : "";
            meta.appendChild(rt);

            fetch("/data/blogs/" + post.file, { cache: "default" })
                .then(function (r) {
                    return r.text();
                })
                .then(function (md) {
                    rt.textContent = calcReadingTime(md) + " min read";
                    const imgSrc = extractFirstMdImage(md);
                    if (imgSrc) {
                        const thumb = document.createElement("img");
                        thumb.classList.add("recent-card-thumb");
                        thumb.src = imgSrc;
                        thumb.alt = post.title;
                        thumb.loading = "lazy";
                        thumb.onerror = function () {
                            if (thumb.parentNode)
                                thumb.parentNode.replaceChild(
                                    thumbPlaceholder,
                                    thumb,
                                );
                        };
                        if (thumbPlaceholder.parentNode)
                            thumbPlaceholder.parentNode.replaceChild(
                                thumb,
                                thumbPlaceholder,
                            );
                    }
                })
                .catch(function () {});

            const desc = document.createElement("p");
            desc.classList.add("recent-card-desc");
            desc.textContent = post.description;

            body.appendChild(titleLink);
            body.appendChild(meta);
            body.appendChild(desc);
            inner.appendChild(thumbPlaceholder);
            inner.appendChild(body);
            card.appendChild(inner);
            frag.appendChild(card);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML = "";
    }
}

/* ══════════════════════════════════════════════════════════
   BLOG POST RENDERER
   ══════════════════════════════════════════════════════════ */

async function fetchBlogPost() {
    const container = document.getElementById("blog-post-container");
    if (!container) return;

    container.innerHTML =
        '<div class="blog-post-wrapper" style="padding-top:120px;">' +
        '<div class="skeleton-paper" style="margin-bottom:20px;"><div class="skeleton-item sk-title" style="width:80%;height:32px;"></div></div>' +
        '<div class="skeleton-paper"><div class="skeleton-item sk-meta" style="width:40%;"></div>' +
        '<div class="skeleton-item sk-line"></div><div class="skeleton-item sk-line"></div>' +
        '<div class="skeleton-item sk-line"></div><div class="skeleton-item sk-line" style="width:60%;"></div></div>' +
        "</div>";

    const _skeletonStart = Date.now();
    const _MIN_SKELETON_MS = 600;

    function showError(msg) {
        container.innerHTML =
            '<div class="blog-post-wrapper">' +
            '<a class="blog-back-link" href="blogs">⟵ Back to Blog</a>' +
            '<p style="color:#707070;font-family:Noto,sans-serif;font-size:18px;margin-top:40px;">' +
            msg +
            "</p>" +
            "</div>";
    }

    const params = new URLSearchParams(window.location.search);
    let postFile = params.get("post");

    if (!postFile) {
        showError("No post specified.");
        return;
    }

    if (!postFile.endsWith(".md")) {
        postFile = postFile + ".md";
    }

    try {
        const markedRenderer = new marked.Renderer();

        function escapeHtmlAttr(str) {
            return String(str || "")
                .replace(/&/g, "&amp;")
                .replace(/"/g, "&quot;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        }

        markedRenderer.link = function (href, title, text) {
            let safeHref = href || "#";
            if (/^javascript:/i.test(safeHref)) safeHref = "#";
            const isExternal = /^https?:\/\//.test(safeHref);
            let attrs = 'href="' + escapeHtmlAttr(safeHref) + '"';
            if (title) attrs += ' title="' + escapeHtmlAttr(title) + '"';
            if (isExternal)
                attrs += ' target="_blank" rel="noopener noreferrer"';
            return "<a " + attrs + ">" + text + "</a>";
        };

        markedRenderer.image = function (href, title, alt) {
            let customWidth = null;
            let customHeight = null;
            let caption = alt || "";

            if (title) {
                const sizeMatch = title.match(
                    /^(\d+)(?:x(\d+))?(?:\s+([\s\S]*))?$/,
                );
                if (sizeMatch) {
                    customWidth = parseInt(sizeMatch[1], 10);
                    if (sizeMatch[2]) customHeight = parseInt(sizeMatch[2], 10);
                    caption = sizeMatch[3] ? sizeMatch[3].trim() : alt || "";
                } else {
                    caption = title;
                }
            }

            let sizeStyle = "";
            if (customWidth) {
                sizeStyle =
                    "width:" +
                    customWidth +
                    "px !important;min-width:0 !important;";
                if (customHeight)
                    sizeStyle += "height:" + customHeight + "px !important;";
                else sizeStyle += "height:auto !important;";
            }

            let imgAttrs =
                'src="' +
                escapeHtmlAttr(href || "") +
                '" alt="' +
                escapeHtmlAttr(alt || "") +
                '" loading="lazy"';
            if (sizeStyle) imgAttrs += ' style="' + sizeStyle + '"';

            const figureStyle = customWidth
                ? ' style="width:' + customWidth + 'px"'
                : "";

            if (caption) {
                return (
                    '<figure class="blog-figure"' +
                    figureStyle +
                    ">" +
                    "<img " +
                    imgAttrs +
                    ' class="blog-figure-img' +
                    (customWidth ? " blog-figure-img--custom" : "") +
                    '"' +
                    " onerror=\"this.parentElement.classList.add('blog-img-error')\">" +
                    '<figcaption class="blog-figcaption">' +
                    caption +
                    "</figcaption>" +
                    "</figure>"
                );
            }
            return (
                '<figure class="blog-figure"' +
                figureStyle +
                ">" +
                "<img " +
                imgAttrs +
                ' class="blog-figure-img' +
                (customWidth ? " blog-figure-img--custom" : "") +
                '"' +
                " onerror=\"this.parentElement.classList.add('blog-img-error')\">" +
                "</figure>"
            );
        };

        const metaRes = fetch("/data/blogs.json", { cache: "default" });
        const contentRes = fetch("/data/blogs/" + postFile, {
            cache: "default",
        });
        const resolved = await Promise.all([metaRes, contentRes]);

        if (!resolved[1].ok) {
            showError("Post not found.");
            return;
        }

        const parsed = await Promise.all([
            resolved[0].json(),
            resolved[1].text(),
        ]);
        const posts = parsed[0];
        const markdown = parsed[1];

        let meta =
            posts.find(function (p) {
                return p.file === postFile;
            }) || null;
        if (!meta) meta = {};

        /* ── Prev / Next post navigation (chronological) ─── */
        const postIndex = posts.findIndex(function (p) {
            return p.file === postFile;
        });
        const prevChronPost =
            postIndex < posts.length - 1 ? posts[postIndex + 1] : null; // older date
        const nextChronPost = postIndex > 0 ? posts[postIndex - 1] : null; // newer date

        if (meta.title) document.title = meta.title + " | Yare Sama";

        let tagsHTML = "";
        if (meta.tags) {
            for (let j = 0; j < meta.tags.length; j++) {
                tagsHTML +=
                    '<a href="/blogs?tag=' +
                    encodeURIComponent(meta.tags[j]) +
                    '" class="blog-tag-pill">' +
                    meta.tags[j] +
                    "</a>";
            }
        }

        let dateHTML = "";
        if (meta.date) {
            const d = new Date(meta.date + "T00:00:00");
            dateHTML =
                '<span class="blog-post-date">' +
                d.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                }) +
                "</span>";
        }

        /* ── Series banner + prev/next navigation ──────────── */
        let seriesBannerHTML = "";
        let seriesFooterHTML = "";
        if (meta.series && meta.series.name) {
            const seriesPosts = posts
                .filter(function (p) {
                    return p.series && p.series.name === meta.series.name;
                })
                .sort(function (a, b) {
                    return a.series.part - b.series.part;
                });

            const currentIdx = seriesPosts.findIndex(function (p) {
                return p.file === postFile;
            });
            const prevPost =
                currentIdx > 0 ? seriesPosts[currentIdx - 1] : null;
            const nextPost =
                currentIdx < seriesPosts.length - 1
                    ? seriesPosts[currentIdx + 1]
                    : null;

            const badgeLabel =
                "Part " +
                meta.series.part +
                " of " +
                meta.series.total +
                " \u00b7 " +
                meta.series.name;

            const prevLink = prevPost
                ? '<a class="series-nav-link series-nav-prev" href="' +
                  getPostUrl(prevPost.file.replace(/\.md$/, "")) +
                  '">' +
                  '<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>' +
                  '<span class="series-nav-label"><span class="series-nav-hint">Previous</span>' +
                  '<span class="series-nav-title">' +
                  prevPost.title +
                  "</span></span>" +
                  "</a>"
                : '<span class="series-nav-link series-nav-prev series-nav-link--empty"></span>';

            const nextLink = nextPost
                ? '<a class="series-nav-link series-nav-next" href="' +
                  getPostUrl(nextPost.file.replace(/\.md$/, "")) +
                  '">' +
                  '<span class="series-nav-label"><span class="series-nav-hint">Next</span>' +
                  '<span class="series-nav-title">' +
                  nextPost.title +
                  "</span></span>" +
                  '<i class="fa-solid fa-arrow-right" aria-hidden="true"></i>' +
                  "</a>"
                : '<span class="series-nav-link series-nav-next series-nav-link--empty"></span>';

            const tocLabel =
                "All " + seriesPosts.length + " parts in this series";

            const tocItemsHTML = seriesPosts
                .map(function (p) {
                    const isCurrent = p.file === postFile;
                    return (
                        '<a href="' +
                        getPostUrl(p.file.replace(/\.md$/, "")) +
                        '" class="series-toc-item' +
                        (isCurrent ? " series-toc-item--active" : "") +
                        '">' +
                        '<span class="series-toc-num">' +
                        p.series.part +
                        "</span>" +
                        '<span class="series-toc-title">' +
                        p.title +
                        "</span>" +
                        "</a>"
                    );
                })
                .join("");

            seriesBannerHTML =
                '<div class="series-banner">' +
                '<div class="series-banner-badge">' +
                '<i class="fa-solid fa-layer-group" aria-hidden="true"></i>' +
                "<span>" +
                badgeLabel +
                "</span>" +
                "</div>" +
                '<details class="series-toc-details">' +
                '<summary class="series-toc-summary">' +
                '<i class="fa-solid fa-list-ul" aria-hidden="true"></i>' +
                tocLabel +
                '<i class="fa-solid fa-chevron-down series-toc-chevron" aria-hidden="true"></i>' +
                "</summary>" +
                '<div class="series-toc">' +
                tocItemsHTML +
                "</div>" +
                "</details>" +
                "</div>";

            seriesFooterHTML = "";
        }

        /* Pre-process footnotes then math before marked touches the text */
        const fnResult = processFootnotes(markdown);
        const mathResult = extractMath(fnResult.processed);

        let bodyHTML = marked.parse(mathResult.out, {
            renderer: markedRenderer,
        });

        /* Post-process: restore KaTeX, then append footnotes */
        bodyHTML = restoreMath(bodyHTML, mathResult.blocks, mathResult.spans);
        const footnotesHTML = buildFootnotesHTML(
            fnResult.defs,
            fnResult.usedLabels,
        );

        const readingMins = calcReadingTime(markdown);
        const readingTimeHTML =
            '<span class="blog-reading-time">' +
            readingMins +
            " min read</span>";

        /* ── Prev / Next post nav HTML ───────────────────── */
        let postNavHTML = "";
        if (prevChronPost || nextChronPost) {
            const navLabel =
                '<p class="post-nav-section-label"><i class="fa-solid fa-compass" aria-hidden="true"></i> Other Articles</p>';
            postNavHTML =
                navLabel +
                '<nav class="post-nav" aria-label="Post navigation">';
            if (prevChronPost) {
                postNavHTML +=
                    '<a class="post-nav-link post-nav-prev" href="' +
                    getPostUrl(prevChronPost.file.replace(/\.md$/, "")) +
                    '">' +
                    '<span class="post-nav-hint"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Previous Post</span>' +
                    '<span class="post-nav-title">' +
                    prevChronPost.title +
                    "</span>" +
                    "</a>";
            } else {
                postNavHTML +=
                    '<span class="post-nav-link post-nav-prev post-nav-link--empty"></span>';
            }
            if (nextChronPost) {
                postNavHTML +=
                    '<a class="post-nav-link post-nav-next" href="' +
                    getPostUrl(nextChronPost.file.replace(/\.md$/, "")) +
                    '">' +
                    '<span class="post-nav-hint">Next Post <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>' +
                    '<span class="post-nav-title">' +
                    nextChronPost.title +
                    "</span>" +
                    "</a>";
            } else {
                postNavHTML +=
                    '<span class="post-nav-link post-nav-next post-nav-link--empty"></span>';
            }
            postNavHTML += "</nav>";
        }

        const bmcHTML =
            '<div class="bmc-post-section">' +
            "<p>If you found this article helpful or enjoyable, consider supporting my work — it means a lot and helps me keep writing!</p>" +
            '<a class="bmc-post-btn" href="https://buymeacoffee.com/v3xlrm1nowo1" target="_blank" rel="noopener noreferrer">' +
            '<i class="fa-solid fa-mug-hot"></i> Buy me a coffee' +
            "</a>" +
            "</div>";

        const shareURL = window.location.href;
        const twitterText = encodeURIComponent(
            (meta.title || "Blog post") + " \u2014 by @v3xlrm1nOwo1\n",
        );
        const twitterHref =
            "https://twitter.com/intent/tweet?text=" +
            twitterText +
            "&url=" +
            encodeURIComponent(shareURL);
        const linkedInHref =
            "https://www.linkedin.com/sharing/share-offsite/?url=" +
            encodeURIComponent(shareURL);
        const shareHTML =
            '<div class="post-share">' +
            '<span class="post-share-label">Share:</span>' +
            '<button class="post-share-btn" id="share-copy-link" type="button" aria-label="Copy link to clipboard">' +
            '<i class="fa-regular fa-copy"></i> Copy Link' +
            "</button>" +
            '<a class="post-share-btn" href="' +
            twitterHref +
            '" target="_blank" rel="noopener noreferrer" aria-label="Share on X">' +
            '<i class="fa-brands fa-x-twitter"></i> Share on X' +
            "</a>" +
            '<a class="post-share-btn post-share-btn--linkedin" href="' +
            linkedInHref +
            '" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">' +
            '<i class="fa-brands fa-linkedin-in"></i> Share on LinkedIn' +
            "</a>" +
            "</div>";

        const _skeletonElapsed = Date.now() - _skeletonStart;
        const _skeletonRemaining = _MIN_SKELETON_MS - _skeletonElapsed;
        if (_skeletonRemaining > 0) {
            await new Promise(function (resolve) {
                setTimeout(resolve, _skeletonRemaining);
            });
        }

        /* Fade the skeleton out smoothly before swapping content */
        container.style.transition = "opacity 0.35s ease";
        container.style.opacity = "0";
        await new Promise(function (resolve) {
            setTimeout(resolve, 550);
        });
        container.style.transition = "";
        container.style.opacity = "";

        container.innerHTML =
            '<div class="blog-post-wrapper">' +
            '<a class="blog-back-link" href="blogs">⟵ Back to Blog</a>' +
            seriesBannerHTML +
            (meta.title
                ? '<h1 class="blog-post-title">' + meta.title + "</h1>"
                : "") +
            '<div class="blog-post-meta">' +
            dateHTML +
            (tagsHTML || readingTimeHTML
                ? '<div class="blog-post-tags">' +
                  tagsHTML +
                  readingTimeHTML +
                  "</div>"
                : "") +
            "</div>" +
            shareHTML +
            '<hr class="blog-divider">' +
            '<div class="blog-content">' +
            bodyHTML +
            footnotesHTML +
            "</div>" +
            seriesFooterHTML +
            '<a class="blog-back-link blog-back-link--bottom" href="blogs">⟵ Back to Blog</a>' +
            postNavHTML +
            bmcHTML +
            "</div>";

        container.style.animation =
            "pt-slide-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.08s both";

        const copyLinkBtn = document.getElementById("share-copy-link");
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener("click", function () {
                const doSuccess = function () {
                    copyLinkBtn.innerHTML =
                        '<i class="fa-solid fa-check"></i> Copied!';
                    copyLinkBtn.classList.add("copied");
                    setTimeout(function () {
                        copyLinkBtn.innerHTML =
                            '<i class="fa-regular fa-copy"></i> Copy Link';
                        copyLinkBtn.classList.remove("copied");
                    }, 2200);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard
                        .writeText(shareURL)
                        .then(doSuccess)
                        .catch(function () {});
                }
            });
        }

        const firstH1 = container.querySelector(".blog-content h1:first-child");
        if (firstH1) firstH1.remove();

        /* ── Floating Table of Contents sidebar ───────────────── */
        (function buildToC() {
            const content = container.querySelector(".blog-content");
            if (!content) return;
            const headings = content.querySelectorAll("h2, h3");
            if (headings.length < 2) return;

            headings.forEach(function (h, i) {
                if (!h.id) {
                    h.id = "toc-heading-" + i;
                }
            });

            const tocItems = Array.from(headings)
                .map(function (h) {
                    const isSub = h.tagName === "H3";
                    return (
                        '<a class="blog-toc-item' +
                        (isSub ? " blog-toc-item--sub" : "") +
                        '" href="#' +
                        h.id +
                        '">' +
                        h.textContent +
                        "</a>"
                    );
                })
                .join("");

            const toc = document.createElement("nav");
            toc.className = "blog-toc-sidebar";
            toc.setAttribute("aria-label", "Table of contents");
            toc.innerHTML =
                '<p class="blog-toc-title">\u2726 Contents</p>' + tocItems;

            const wrapper = container.querySelector(".blog-post-wrapper");
            if (wrapper) {
                const layout = document.createElement("div");
                layout.className = "blog-post-layout";
                container.insertBefore(layout, wrapper);
                layout.appendChild(toc);
                layout.appendChild(wrapper);
            }

            const observer = new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        const id = entry.target.id;
                        const link = toc.querySelector('a[href="#' + id + '"]');
                        if (!link) return;
                        if (entry.isIntersecting) {
                            toc.querySelectorAll(".blog-toc-item").forEach(
                                function (l) {
                                    l.classList.remove("blog-toc-item--active");
                                },
                            );
                            link.classList.add("blog-toc-item--active");
                            var target =
                                link.offsetTop -
                                toc.clientHeight / 2 +
                                link.clientHeight / 2;
                            toc.scrollTo({
                                top: Math.max(0, target),
                                behavior: "smooth",
                            });
                        }
                    });
                },
                { rootMargin: "-10% 0px -80% 0px", threshold: 0 },
            );

            headings.forEach(function (h) {
                observer.observe(h);
            });
        })();

        /* ── Highlight + language badge — single pass ───────────────── */
        const langDisplayNames = {
            python: "Python",
            javascript: "JavaScript",
            js: "JavaScript",
            typescript: "TypeScript",
            ts: "TypeScript",
            bash: "Bash",
            shell: "Shell",
            sh: "Shell",
            zsh: "Zsh",
            json: "JSON",
            html: "HTML",
            css: "CSS",
            scss: "SCSS",
            sql: "SQL",
            java: "Java",
            cpp: "C++",
            "c++": "C++",
            c: "C",
            rust: "Rust",
            go: "Go",
            ruby: "Ruby",
            php: "PHP",
            swift: "Swift",
            kotlin: "Kotlin",
            r: "R",
            yaml: "YAML",
            toml: "TOML",
            xml: "XML",
            markdown: "Markdown",
            dockerfile: "Dockerfile",
            makefile: "Makefile",
            lua: "Lua",
            perl: "Perl",
            scala: "Scala",
            haskell: "Haskell",
            julia: "Julia",
            matlab: "MATLAB",
            powershell: "PowerShell",
            plaintext: "Text",
            text: "Text",
        };

        document
            .querySelectorAll(".blog-content pre code")
            .forEach(function (block) {
                hljs.highlightElement(block);

                let lang = null;
                block.classList.forEach(function (cls) {
                    if (cls.startsWith("language-")) lang = cls.slice(9);
                });
                if (!lang && block.result && block.result.language) {
                    lang = block.result.language;
                }
                if (!lang) return;
                const lower = lang.toLowerCase();
                if (lower === "plaintext" || lower === "text") return;
                const display =
                    langDisplayNames[lower] ||
                    lang.charAt(0).toUpperCase() + lang.slice(1);
                const badge = document.createElement("span");
                badge.className = "code-lang-badge";
                badge.textContent = display;
                const pre = block.parentElement;
                pre.classList.add("has-lang-badge");
                pre.insertBefore(badge, pre.firstChild);
            });

        document.querySelectorAll(".blog-content pre").forEach(function (pre) {
            const btn = document.createElement("button");
            btn.className = "copy-code-btn";
            btn.setAttribute("aria-label", "Copy code");
            btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
            btn.addEventListener("click", function () {
                const code = pre.querySelector("code");
                const text = code ? code.innerText : pre.innerText;
                const doSuccess = function () {
                    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                    btn.classList.add("copied");
                    setTimeout(function () {
                        btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                        btn.classList.remove("copied");
                    }, 2000);
                };
                const execFallback = function () {
                    try {
                        const ta = document.createElement("textarea");
                        ta.value = text;
                        ta.style.cssText = "position:fixed;opacity:0;";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                        doSuccess();
                    } catch (e2) {}
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard
                        .writeText(text)
                        .then(doSuccess)
                        .catch(execFallback);
                } else {
                    execFallback();
                }
            });
            pre.appendChild(btn);
        });
    } catch (e) {
        showError("Could not load this post.");
    }
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION HELPERS
   ══════════════════════════════════════════════════════════ */

function markCurrentNav() {
    const current =
        window.location.pathname.replace(/\.html$/, "").replace(/^\//, "") ||
        "index";
    document.querySelectorAll(".nav-link").forEach(function (link) {
        const href = link.getAttribute("href");
        if (!href) return;
        const page = href.replace(/^\//, "").replace(/\.html$/, "");
        if (page === current) {
            link.setAttribute("aria-current", "page");
        }
    });
}

/* ── Homepage — recent career ─────────────────────────── */

async function fetchHomepageCareer() {
    const container = document.getElementById("hp-career");
    if (!container) return;

    showSkeleton(container, "card", 2);

    try {
        const response = await fetch("/data/career.json", {
            cache: "default",
        });
        const data = await response.json();

        container.innerHTML = "";

        if (!data.length) {
            const p = document.createElement("p");
            p.style.cssText =
                "color:#707070;font-family:Raleway,sans-serif;font-size:16px;";
            p.textContent = "No career entries yet.";
            container.appendChild(p);
            return;
        }

        function parseEndYearHp(period) {
            if (/present/i.test(String(period || ""))) return 9999;
            const matches = String(period || "").match(/\d{4}/g);
            return matches ? parseInt(matches[matches.length - 1], 10) : 0;
        }
        data.sort(
            (a, b) => parseEndYearHp(b.period) - parseEndYearHp(a.period),
        );

        const frag = document.createDocumentFragment();
        data.slice(0, 2).forEach(function (entry) {
            const card = document.createElement("div");
            card.classList.add("recent-card", "career-recent-card");

            const inner = document.createElement("div");
            inner.classList.add("recent-card-inner");

            const iconWrap = document.createElement("div");
            iconWrap.classList.add("career-recent-icon");
            const icon = document.createElement("i");
            icon.classList.add(
                "fas",
                entry.type === "education"
                    ? "fa-graduation-cap"
                    : "fa-briefcase",
            );
            icon.setAttribute("aria-hidden", "true");
            iconWrap.appendChild(icon);

            const body = document.createElement("div");
            body.classList.add("recent-card-body");

            const title = document.createElement("span");
            title.classList.add("recent-card-title");
            title.textContent = entry.title;

            const meta = document.createElement("div");
            meta.classList.add("recent-card-meta");

            const periodSpan = document.createElement("span");
            periodSpan.classList.add("blog-date");
            periodSpan.textContent =
                entry.period +
                (entry.organization ? "  ·  " + entry.organization : "");
            meta.appendChild(periodSpan);

            (entry.tags || []).slice(0, 3).forEach(function (tag) {
                const pill = document.createElement("span");
                pill.classList.add("blog-tag-pill");
                pill.textContent = tag;
                meta.appendChild(pill);
            });

            const desc = document.createElement("p");
            desc.classList.add("recent-card-desc");
            desc.textContent = entry.description;

            body.appendChild(title);
            body.appendChild(meta);
            body.appendChild(desc);
            inner.appendChild(iconWrap);
            inner.appendChild(body);
            card.appendChild(inner);
            frag.appendChild(card);
        });
        container.appendChild(frag);
    } catch (e) {
        container.innerHTML = "";
    }
}

/* ══════════════════════════════════════════════════════════
   CAREER PAGE
   ══════════════════════════════════════════════════════════ */

async function fetchCareer() {
    const eduContainer = document.getElementById("careerEducationList");
    const expContainer = document.getElementById("careerExperienceList");
    if (!eduContainer && !expContainer) return;

    if (eduContainer) showSkeleton(eduContainer, "card", 1);
    if (expContainer) showSkeleton(expContainer, "card", 2);

    try {
        const response = await fetch("/data/career.json", {
            cache: "default",
        });
        const data = await response.json();

        if (eduContainer) eduContainer.innerHTML = "";
        if (expContainer) expContainer.innerHTML = "";

        const eduFrag = document.createDocumentFragment();
        const expFrag = document.createDocumentFragment();

        function parseStartYear(period) {
            const m = String(period || "").match(/\d{4}/);
            return m ? parseInt(m[0], 10) : 0;
        }

        function parseEndYear(period) {
            if (/present/i.test(String(period || ""))) return 9999;
            const matches = String(period || "").match(/\d{4}/g);
            return matches ? parseInt(matches[matches.length - 1], 10) : 0;
        }

        const eduEntries = data
            .filter((e) => e.type === "education")
            .sort(
                (a, b) => parseStartYear(a.period) - parseStartYear(b.period),
            );
        const expEntries = data
            .filter((e) => e.type !== "education")
            .sort((a, b) => parseEndYear(b.period) - parseEndYear(a.period));
        const sorted = [...eduEntries, ...expEntries];

        sorted.forEach(function (entry) {
            const el = document.createElement("div");
            el.classList.add("career-entry");

            const period = document.createElement("div");
            period.classList.add("career-entry__period");
            period.textContent = entry.period;

            const content = document.createElement("div");
            content.classList.add("career-entry__content");

            const headerRow = document.createElement("div");
            headerRow.classList.add("career-entry__header");

            const titleEl = document.createElement("h3");
            titleEl.classList.add("career-entry__title");
            if (entry.url) {
                const titleLink = document.createElement("a");
                titleLink.href = entry.url;
                titleLink.target = "_blank";
                titleLink.rel = "noopener noreferrer";
                titleLink.textContent = entry.title;
                titleEl.appendChild(titleLink);
            } else {
                titleEl.textContent = entry.title;
            }

            headerRow.appendChild(titleEl);

            if (entry.location) {
                const locEl = document.createElement("span");
                locEl.classList.add("career-entry__location");
                locEl.innerHTML =
                    '<i class="fas fa-location-dot" aria-hidden="true"></i> ' +
                    entry.location;
                headerRow.appendChild(locEl);
            }

            content.appendChild(headerRow);

            if (entry.organization) {
                const orgEl = document.createElement("div");
                orgEl.classList.add("career-entry__org");
                orgEl.textContent = entry.organization;
                content.appendChild(orgEl);
            }

            if (entry.description) {
                const descEl = document.createElement("p");
                descEl.classList.add("career-entry__desc");
                descEl.textContent = entry.description;
                content.appendChild(descEl);
            }

            if (entry.tags && entry.tags.length) {
                const tagsEl = document.createElement("div");
                tagsEl.classList.add("career-entry__tags");
                entry.tags.forEach(function (tag) {
                    const pill = document.createElement("span");
                    pill.classList.add("blog-tag-pill");
                    pill.textContent = tag;
                    tagsEl.appendChild(pill);
                });
                content.appendChild(tagsEl);
            }

            el.appendChild(period);
            el.appendChild(content);

            if (entry.type === "education") {
                eduFrag.appendChild(el);
            } else {
                expFrag.appendChild(el);
            }
        });

        if (eduContainer) {
            if (!eduFrag.hasChildNodes()) {
                eduContainer.innerHTML =
                    '<p style="color:#707070;font-family:Raleway,sans-serif;font-size:16px;">No education entries.</p>';
            } else {
                eduContainer.appendChild(eduFrag);
            }
        }
        if (expContainer) {
            if (!expFrag.hasChildNodes()) {
                expContainer.innerHTML =
                    '<p style="color:#707070;font-family:Raleway,sans-serif;font-size:16px;">No experience entries.</p>';
            } else {
                expContainer.appendChild(expFrag);
            }
        }
    } catch (e) {
        if (eduContainer) eduContainer.innerHTML = "";
        if (expContainer) expContainer.innerHTML = "";
    }
}

/* ══════════════════════════════════════════════════════════
   HERO STATS STRIP — papers · citations · venues counters
   ══════════════════════════════════════════════════════════ */

async function fetchHeroStats() {
    const el = document.getElementById("hero-stats");
    if (!el) return;
    try {
        const response = await fetch("/data/publications.json", {
            cache: "force-cache",
        });
        const data = await response.json();
        const totalPapers = data.length;
        const totalCitations = data.reduce(function (s, p) {
            return s + (p.citations || 0);
        }, 0);
        const totalVenues = data.filter(function (p) {
            return p.isConference === true;
        }).length;

        const paperLabel = "papers";
        const citationLabel = totalCitations === 1 ? "citation" : "citations";
        const venueLabel = "conferences";

        el.innerHTML =
            '<div class="pub-stat-item">' +
            '<i class="fa-solid fa-file-lines pub-stat-icon" aria-hidden="true"></i>' +
            '<span class="pub-stat-num" data-target="' + totalPapers + '">0</span>' +
            '<span class="pub-stat-label">' + paperLabel + '</span>' +
            '</div>' +
            '<div class="pub-stat-sep" aria-hidden="true"></div>' +
            '<div class="pub-stat-item">' +
            '<i class="fa-solid fa-quote-left pub-stat-icon" aria-hidden="true"></i>' +
            '<span class="pub-stat-num" data-target="' + totalCitations + '" data-format="citation">0</span>' +
            '<span class="pub-stat-label">' + citationLabel + '</span>' +
            '</div>' +
            '<div class="pub-stat-sep" aria-hidden="true"></div>' +
            '<div class="pub-stat-item">' +
            '<i class="fa-solid fa-building-columns pub-stat-icon" aria-hidden="true"></i>' +
            '<span class="pub-stat-num" data-target="' + totalVenues + '">0</span>' +
            '<span class="pub-stat-label">' + venueLabel + '</span>' +
            '</div>';

        function formatStatNum(n, isCitation) {
            if (isCitation && n >= 1000)
                return "+" + (n / 1000).toFixed(1) + "k";
            return String(n);
        }

        function runCounters() {
            el.querySelectorAll(".pub-stat-num").forEach(function (numEl) {
                var target = parseInt(numEl.getAttribute("data-target"), 10);
                var isCitation =
                    numEl.getAttribute("data-format") === "citation";
                if (target === 0) {
                    numEl.textContent = "0";
                    return;
                }
                var startTs = null;
                var dur = 1100;
                function step(ts) {
                    if (!startTs) startTs = ts;
                    var progress = Math.min((ts - startTs) / dur, 1);
                    var eased = 1 - Math.pow(1 - progress, 3);
                    var current = Math.round(target * eased);
                    numEl.textContent = formatStatNum(current, isCitation);
                    if (progress < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
            });
        }

        var observer = new IntersectionObserver(
            function (entries, obs) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        runCounters();
                        obs.disconnect();
                    }
                });
            },
            { threshold: 0.3 },
        );
        observer.observe(el);
    } catch (e) {}
}

/* ══════════════════════════════════════════════════════════
   PUB STATS STRIP — publications page summary bar
   ══════════════════════════════════════════════════════════ */

async function fetchPubStats() {
    const el = document.getElementById("pub-stats");
    if (!el) return;
    try {
        const response = await fetch("/data/publications.json", {
            cache: "no-cache",
        });
        const data = await response.json();
        const totalPapers = data.length;
        const totalCitations = data.reduce(function (s, p) {
            return s + (p.citations || 0);
        }, 0);
        const totalVenues = data.filter(function (p) {
            return p.isConference === true;
        }).length;

        const citationLabel = totalCitations === 1 ? "citation" : "citations";

        el.innerHTML =
            '<div class="pub-stat-item">' +
            '<i class="fa-solid fa-file-lines pub-stat-icon" aria-hidden="true"></i>' +
            '<span class="pub-stat-num" data-target="' + totalPapers + '">0</span>' +
            '<span class="pub-stat-label">papers</span>' +
            '</div>' +
            '<div class="pub-stat-sep" aria-hidden="true"></div>' +
            '<div class="pub-stat-item">' +
            '<i class="fa-solid fa-quote-left pub-stat-icon" aria-hidden="true"></i>' +
            '<span class="pub-stat-num" data-target="' + totalCitations + '" data-format="citation">0</span>' +
            '<span class="pub-stat-label">' + citationLabel + '</span>' +
            '</div>' +
            '<div class="pub-stat-sep" aria-hidden="true"></div>' +
            '<div class="pub-stat-item">' +
            '<i class="fa-solid fa-building-columns pub-stat-icon" aria-hidden="true"></i>' +
            '<span class="pub-stat-num" data-target="' + totalVenues + '">0</span>' +
            '<span class="pub-stat-label">conferences</span>' +
            '</div>';

        function formatStatNum(n, isCitation) {
            if (isCitation && n >= 1000) return "+" + (n / 1000).toFixed(1) + "k";
            return String(n);
        }

        function runCounters() {
            el.querySelectorAll(".pub-stat-num").forEach(function (numEl) {
                var target = parseInt(numEl.getAttribute("data-target"), 10);
                var isCitation = numEl.getAttribute("data-format") === "citation";
                if (target === 0) { numEl.textContent = "0"; return; }
                var startTs = null;
                var dur = 1100;
                function step(ts) {
                    if (!startTs) startTs = ts;
                    var progress = Math.min((ts - startTs) / dur, 1);
                    var eased = 1 - Math.pow(1 - progress, 3);
                    var current = Math.round(target * eased);
                    numEl.textContent = formatStatNum(current, isCitation);
                    if (progress < 1) requestAnimationFrame(step);
                }
                requestAnimationFrame(step);
            });
        }

        // Trigger the counter exactly when the section's entrance animation ends,
        // so the numbers count up on a fully-visible element every page visit.
        // A guarded flag ensures it only fires once even if child animations
        // also bubble an animationend before the section's own event arrives.
        var started = false;
        function startOnce() {
            if (!started) {
                started = true;
                runCounters();
            }
        }

        el.addEventListener("animationend", function handler(e) {
            if (e.target === el) {
                el.removeEventListener("animationend", handler);
                startOnce();
            }
        });
        // Fallback: covers prefers-reduced-motion (no animationend fires)
        // and any edge case where the event is missed.
        setTimeout(startOnce, 1060);
    } catch (e) {}
}

/* ══════════════════════════════════════════════════════════
   PAGE INITIALISER — runs all fetches in parallel
   ══════════════════════════════════════════════════════════ */

(function init() {
    markCurrentNav();
    const isHome = !!document.getElementById("hp-projects");
    const isProjects = !!document.getElementById("meanProjectsList");
    const isPubs = !!document.getElementById("paperList");
    const isBlogs = !!document.getElementById("blogList");
    const isBlogPost = !!document.getElementById("blog-post-container");
    const isCareer = !!document.getElementById("careerEducationList");

    fetchSocial().catch(function () {});

    if (isHome) {
        fetchHeroStats();
        Promise.all([
            fetchCertificates(),
            fetchHomepageProjects(),
            fetchHomepagePublications(),
            fetchHomepageBlogs(),
            fetchHomepageCareer(),
        ]);
    }

    if (isProjects) {
        Promise.all([
            fetchMeanProjects().catch(function () {}),
            fetchProjects().catch(function () {}),
            fetchDatasets(),
        ]);
    }

    if (isPubs) { fetchPublications(); fetchPubStats(); }
    if (isBlogs) fetchBlogs();
    if (isBlogPost) fetchBlogPost();
    if (isCareer) fetchCareer();
})();
