const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const url = require('url');

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = '0.0.0.0';

/* ── MIME types, compression settings, cache + utility helpers ── */

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.md']);

function getCacheControl(ext) {
  if (['.html', '.js', '.css', '.md', '.json'].includes(ext)) return 'no-cache';
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf'].includes(ext))
    return 'public, max-age=604800, immutable';
  return 'no-cache';
}

function makeEtag(mtime, size) {
  return '"' + mtime.getTime().toString(16) + '-' + size.toString(16) + '"';
}

/* Determine the request protocol.
   Checks X-Forwarded-Proto (set by any reverse proxy / CDN) first;
   falls back to http for local hosts and https for everything else. */
function getProto(req) {
  const fwd = req.headers['x-forwarded-proto'];
  if (fwd) return fwd.split(',')[0].trim();
  const host = req.headers.host || '';
  const bare = host.split(':')[0];
  return (bare === 'localhost' || bare === '127.0.0.1' || bare === '0.0.0.0' || bare === '[::1]') ? 'http' : 'https';
}

function getPageUrl(req, urlPath) {
  const host = req.headers.host || 'localhost';
  const proto = getProto(req);
  const cleanPath = urlPath.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return proto + '://' + host + cleanPath;
}

/* ── OG / Twitter meta injection ──────────────────────────────── */

function injectOgUrl(html, pageUrl, baseUrl, skipImage) {
  const escaped = pageUrl.replace(/"/g, '&quot;');
  html = html.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
    function (m, a, b) { return a + escaped + b; }
  );
  html = html.replace(
    /(<meta\s+name="twitter:url"\s+content=")[^"]*(")/,
    function (m, a, b) { return a + escaped + b; }
  );
  html = html.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    function (m, a, b) { return a + escaped + b; }
  );
  if (!skipImage) {
    const imgUrl = (baseUrl + '/src/images/elaina/elaina-about-new.jpg').replace(/"/g, '&quot;');
    html = html.replace(
      /(<meta\s+property="og:image"\s+content=")[^"]*(")/,
      function (m, a, b) { return a + imgUrl + b; }
    );
    html = html.replace(
      /(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,
      function (m, a, b) { return a + imgUrl + b; }
    );
    // elaina image is 736×736 — keep the dimension hints
    html = html.replace(
      /(<meta\s+property="og:image:width"\s+content=")[^"]*(")/,
      function (m, a, b) { return a + '736' + b; }
    );
    html = html.replace(
      /(<meta\s+property="og:image:height"\s+content=")[^"]*(")/,
      function (m, a, b) { return a + '736' + b; }
    );
  } else {
    // Post has its own external image — dimensions unknown; remove the tags
    // so crawlers don't receive wrong 736×736 for an unrelated image.
    html = html.replace(/[ \t]*<meta[^>]+property="og:image:width"[^>]*>\n?/g, '');
    html = html.replace(/[ \t]*<meta[^>]+property="og:image:height"[^>]*>\n?/g, '');
  }
  return html;
}

/* ── HTML + static file serving ───────────────────────────────── */

function serveHtml(req, res, resolvedPath, stats, urlPath) {
  const etag = makeEtag(stats.mtime, stats.size);
  const lastModified = stats.mtime.toUTCString();

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];

  if (
    (ifNoneMatch && ifNoneMatch === etag) ||
    (!ifNoneMatch && ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime)
  ) {
    res.writeHead(304, { 'ETag': etag, 'Last-Modified': lastModified, 'Cache-Control': 'no-cache' });
    res.end();
    return;
  }

  fs.readFile(resolvedPath, 'utf8', function (err, html) {
    if (err) {
      res.writeHead(500);
      res.end();
      return;
    }

    const baseUrl = getProto(req) + '://' + (req.headers.host || 'localhost');
    html = injectOgUrl(html, getPageUrl(req, urlPath), baseUrl);

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const canGzip = acceptEncoding.includes('gzip');
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'ETag': etag,
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache',
      'Vary': 'Accept-Encoding',
      'Connection': 'keep-alive',
    };

    if (req.method === 'HEAD') {
      if (canGzip) headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      res.end();
      return;
    }

    const buf = Buffer.from(html, 'utf8');
    if (canGzip) {
      zlib.gzip(buf, function (err2, compressed) {
        if (err2) {
          headers['Content-Length'] = buf.length;
          res.writeHead(200, headers);
          res.end(buf);
        } else {
          headers['Content-Encoding'] = 'gzip';
          res.writeHead(200, headers);
          res.end(compressed);
        }
      });
    } else {
      headers['Content-Length'] = buf.length;
      res.writeHead(200, headers);
      res.end(buf);
    }
  });
}

function serveFile(req, res, resolvedPath, stats, urlPath) {
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.html') {
    serveHtml(req, res, resolvedPath, stats, urlPath || req.url.split('?')[0]);
    return;
  }

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const etag = makeEtag(stats.mtime, stats.size);
  const lastModified = stats.mtime.toUTCString();
  const cacheControl = getCacheControl(ext);

  const ifNoneMatch = req.headers['if-none-match'];
  const ifModifiedSince = req.headers['if-modified-since'];

  if (
    (ifNoneMatch && ifNoneMatch === etag) ||
    (!ifNoneMatch && ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime)
  ) {
    res.writeHead(304, {
      'ETag': etag,
      'Last-Modified': lastModified,
      'Cache-Control': cacheControl,
    });
    res.end();
    return;
  }

  const headers = {
    'Content-Type': contentType,
    'ETag': etag,
    'Last-Modified': lastModified,
    'Cache-Control': cacheControl,
    'Vary': 'Accept-Encoding',
    'Connection': 'keep-alive',
  };

  const acceptEncoding = req.headers['accept-encoding'] || '';
  const canGzip = COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip');

  if (req.method === 'HEAD') {
    if (canGzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end();
    return;
  }

  if (canGzip) {
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    fs.createReadStream(resolvedPath).pipe(zlib.createGzip()).pipe(res);
  } else {
    headers['Content-Length'] = stats.size;
    res.writeHead(200, headers);
    fs.createReadStream(resolvedPath).pipe(res);
  }
}

/* ── Blog post serving + RSS feed + sitemap ───────────────────── */

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractFirstMarkdownImage(markdown, baseUrl) {
  const match = markdown.match(/!\[.*?\]\(([^\s)]+)/);
  if (!match) return null;
  let src = match[1].trim();
  if (/^https?:\/\//.test(src)) return src;
  if (baseUrl && /^[./]/.test(src)) {
    let normalized = src.replace(/^\.\//, '/');
    if (!normalized.startsWith('/')) normalized = '/' + normalized;
    return baseUrl + normalized;
  }
  return null;
}

function serveBlogPost(req, res, postFile) {
  const blogsPath = path.join(__dirname, 'data', 'blogs.json');
  const htmlPath  = path.join(__dirname, 'blog-post.html');
  const mdFile    = postFile.endsWith('.md') ? postFile : postFile + '.md';
  const mdPath    = path.join(__dirname, 'data', 'blogs', mdFile);

  fs.readFile(blogsPath, 'utf8', function (err1, jsonRaw) {
    fs.readFile(htmlPath, 'utf8', function (err2, html) {
      if (err2) { serve404(req, res); return; }

      fs.readFile(mdPath, 'utf8', function (err3, mdRaw) {
        // Note: do NOT inject <base href="/"> here. The blog-post page is served
        // at the root-level path (/blog-post), so all ./src/... and ./data/...
        // relative paths already resolve correctly to /src/... and /data/...
        // A <base href="/"> would break hash-fragment (#section) links by
        // resolving them to /#section (the homepage) instead of scrolling
        // within the current page.

        let meta = null;
        if (!err1) {
          try {
            const posts = JSON.parse(jsonRaw);
            meta = posts.find(function (p) {
              return p.file === postFile || p.file === mdFile;
            }) || null;
          } catch (e) {}
        }

        if (meta) {
          const host    = req.headers.host || 'localhost';
          const proto   = getProto(req);
          const cleanPostFile = postFile.replace(/\.md$/, '');
          const pageUrl = proto + '://' + host + '/blog-post?post=' + encodeURIComponent(cleanPostFile);
          const ogTitle = escapeXml('Mohammed Khalil \u2014 ' + (meta.title || 'Blog Post'));
          const desc    = escapeXml(meta.description || 'A blog post by Mohammed Khalil on  Machine Learning, Deep Learning, ML for Biology, ML Optimization, NLP, Model Surgery, and software development.');
          const pgTitle = escapeXml((meta.title || 'Blog Post') + ' | Yare Sama');

          html = html
            .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/,        function (m, a, b) { return a + desc    + b; })
            .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/,       function (m, a, b) { return a + ogTitle + b; })
            .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/,  function (m, a, b) { return a + desc    + b; })
            .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,       function (m, a, b) { return a + ogTitle + b; })
            .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,  function (m, a, b) { return a + desc    + b; })
            .replace(/(<title>)[^<]*(<\/title>)/,                                function (m, a, b) { return a + pgTitle + b; })
            .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/,              function (m, a, b) { return a + escapeXml(pageUrl) + b; });

          const baseUrl1 = proto + '://' + host;
          let firstImg = null;
          if (!err3 && mdRaw) {
            firstImg = extractFirstMarkdownImage(mdRaw, baseUrl1);
            if (firstImg) {
              const escapedImg = escapeXml(firstImg);
              html = html
                .replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/,   function (m, a, b) { return a + escapedImg + b; })
                .replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/,   function (m, a, b) { return a + escapedImg + b; })
                .replace(/(<meta\s+name="twitter:card"\s+content=")[^"]*(")/,    function (m, a, b) { return a + 'summary_large_image' + b; });
            }
          }

          const hadPostImg = !!firstImg;
          html = injectOgUrl(html, pageUrl, baseUrl1, hadPostImg);

          /* ── Inject BlogPosting JSON-LD ─────────────────── */
          const jsonLdObj = {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            'headline': meta.title || '',
            'description': meta.description || '',
            'datePublished': meta.date || '',
            'dateModified': meta.date || '',
            'author': { '@type': 'Person', 'name': 'Mohammed Khalil', 'url': proto + '://' + host },
            'publisher': { '@type': 'Person', 'name': 'Mohammed Khalil' },
            'url': pageUrl,
            'mainEntityOfPage': { '@type': 'WebPage', '@id': pageUrl },
          };
          const jsonLdStr = JSON.stringify(jsonLdObj).replace(/<\/script>/gi, '<\\/script>');
          html = html.replace('</head>', '<script type="application/ld+json">' + jsonLdStr + '<\/script></head>');
        } else {
          const host2  = req.headers.host || 'localhost';
          const proto2 = getProto(req);
          const fallbackUrl = proto2 + '://' + host2 + '/blog-post?post=' + encodeURIComponent(postFile);
          html = injectOgUrl(html, fallbackUrl, proto2 + '://' + host2);
        }

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(html);
      });
    });
  });
}

/* ── Security headers + 404 handler ───────────────────────────── */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function serve404(req, res) {
  const page404 = path.join(__dirname, '404.html');
  fs.stat(page404, function (err, stats) {
    if (!err && stats.isFile()) {
      fs.readFile(page404, 'utf8', function (err2, html) {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' });
          res.end('404 Not Found');
          return;
        }
        const headers = Object.assign({
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        }, SECURITY_HEADERS);
        const buf = Buffer.from(html, 'utf8');
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (acceptEncoding.includes('gzip')) {
          zlib.gzip(buf, function (err3, compressed) {
            if (err3) {
              headers['Content-Length'] = buf.length;
              res.writeHead(404, headers);
              res.end(buf);
            } else {
              headers['Content-Encoding'] = 'gzip';
              res.writeHead(404, headers);
              res.end(compressed);
            }
          });
        } else {
          headers['Content-Length'] = buf.length;
          res.writeHead(404, headers);
          res.end(buf);
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-cache' });
      res.end('404 Not Found');
    }
  });
}

/* ── HTTP server + request handler ────────────────────────────── */

const server = http.createServer((req, res) => {
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const urlPathRaw = parsedUrl.pathname;

  if (
    (urlPathRaw === '/blog-post.html' || urlPathRaw === '/blog-post') &&
    parsedUrl.query.post
  ) {
    const postFile = parsedUrl.query.post.replace(/[^a-zA-Z0-9._-]/g, '').replace(/\.md$/, '');
    if (postFile) {
      serveBlogPost(req, res, postFile);
      return;
    }
  }

  // Legacy redirect: /blog-post/<slug>[.html] → /blog-post?post=<slug>
  const blogPathMatch = urlPathRaw.match(/^\/blog-post\/([a-zA-Z0-9._-]+?)(?:\.html)?$/);
  if (blogPathMatch && blogPathMatch[1]) {
    res.writeHead(301, {
      'Location': '/blog-post?post=' + blogPathMatch[1],
      'Cache-Control': 'no-cache',
    });
    res.end();
    return;
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';

  if (urlPath.includes('..')) {
    res.writeHead(403);
    res.end();
    return;
  }

  // Block dotfiles and server-side source/config files from being served
  const pathSegments = urlPath.split('/');
  const isBlocked =
    pathSegments.some(function (seg) { return seg.startsWith('.') && seg.length > 1; }) ||
    /^\/(?:server\.js|package(?:-lock)?\.json|robots\.txt\.bak)$/i.test(urlPath);
  if (isBlocked) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (urlPath === '/sitemap.xml') {
    const host = req.headers.host || 'localhost';
    const proto = getProto(req);
    const base = proto + '://' + host;
    const pages = ['/', '/projects', '/publications', '/career', '/blogs'];
    const blogsPath = path.join(__dirname, 'data', 'blogs.json');
    fs.readFile(blogsPath, 'utf8', function (err, jsonRaw) {
      let blogUrls = '';
      if (!err) {
        try {
          const posts = JSON.parse(jsonRaw);
          blogUrls = posts.map(function (p) {
            const slug = (p.file || '').replace(/\.md$/, '');
            return '  <url>\n    <loc>' + base + '/blog-post?post=' + encodeURIComponent(slug) + '</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>';
          }).join('\n');
        } catch (e) {}
      }
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        pages.map(function (p) {
          return '  <url>\n    <loc>' + base + p + '</loc>\n    <changefreq>weekly</changefreq>\n    <priority>' + (p === '/' ? '1.0' : '0.8') + '</priority>\n  </url>';
        }).join('\n') +
        (blogUrls ? '\n' + blogUrls : '') +
        '\n</urlset>\n';
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(xml);
    });
    return;
  }

  if (urlPath === '/robots.txt') {
    const robotsPath = path.join(__dirname, 'robots.txt');
    fs.readFile(robotsPath, 'utf8', function (err, data) {
      const content = err ? 'User-agent: *\nAllow: /\n' : data;
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(content);
    });
    return;
  }

  if (urlPath === '/rss.xml') {
    const host = req.headers.host || 'localhost';
    const proto = getProto(req);
    const base = proto + '://' + host;
    const blogsPath = path.join(__dirname, 'data', 'blogs.json');
    fs.readFile(blogsPath, 'utf8', function (err, jsonRaw) {
      let items = '';
      if (!err) {
        try {
          const posts = JSON.parse(jsonRaw);
          items = posts.map(function (p) {
            const slug    = (p.file || '').replace(/\.md$/, '');
            const postUrl = base + '/blog-post?post=' + encodeURIComponent(slug);
            const pubDate = p.date ? new Date(p.date + 'T00:00:00Z').toUTCString() : '';
            const tagsStr = (p.tags || []).map(function (t) {
              return '<category>' + escapeXml(t) + '</category>';
            }).join('');
            return '<item>\n' +
              '      <title>' + escapeXml(p.title || '') + '</title>\n' +
              '      <link>' + escapeXml(postUrl) + '</link>\n' +
              '      <guid isPermaLink="true">' + escapeXml(postUrl) + '</guid>\n' +
              (pubDate ? '      <pubDate>' + pubDate + '</pubDate>\n' : '') +
              '      <description>' + escapeXml(p.description || '') + '</description>\n' +
              (tagsStr ? '      ' + tagsStr + '\n' : '') +
              '    </item>';
          }).join('\n    ');
        } catch (e) {}
      }
      const now = new Date().toUTCString();
      const rss = '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
        '  <channel>\n' +
        '    <title>Mohammed Khalil — Blog</title>\n' +
        '    <link>' + escapeXml(base + '/blogs') + '</link>\n' +
        '    <description>Technical articles and research writing on  Machine Learning, Deep Learning, ML for Biology, ML Optimization, NLP, Model Surgery, and software development by Mohammed Khalil.</description>\n' +
        '    <language>en-us</language>\n' +
        '    <lastBuildDate>' + now + '</lastBuildDate>\n' +
        '    <atom:link href="' + escapeXml(base + '/rss.xml') + '" rel="self" type="application/rss+xml"/>\n' +
        '    ' + items + '\n' +
        '  </channel>\n' +
        '</rss>\n';
      res.writeHead(200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(rss);
    });
    return;
  }

  const filePath = path.join(__dirname, urlPath);

  fs.stat(filePath, function (err, stats) {
    if (!err && stats.isFile()) {
      serveFile(req, res, filePath, stats, urlPath);
      return;
    }

    if (path.extname(urlPath) === '') {
      const htmlPath = filePath + '.html';
      fs.stat(htmlPath, function (err2, stats2) {
        if (!err2 && stats2.isFile()) {
          serveFile(req, res, htmlPath, stats2, urlPath);
        } else {
          serve404(req, res);
        }
      });
    } else {
      serve404(req, res);
    }
  });
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
