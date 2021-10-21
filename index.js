const lunr = require('lunr');
const striptags = require('striptags');
const cheerio = require('cheerio');
const path = require('path');
const slugid = require('github-slugid')

var searchIndex;
// Called with the `this` context provided by Gitbook
function getSearchIndex(context) {
    if (!searchIndex) {
        // Create search index
        var ignoreSpecialCharacters = context.config.get('pluginsConfig.lunr.ignoreSpecialCharacters') || context.config.get('lunr.ignoreSpecialCharacters');
        searchIndex = lunr(function () {
            this.ref('url');

            this.field('title', { boost: 10 });
            this.field('keywords', { boost: 15 });
            this.field('body');

            if (!ignoreSpecialCharacters) {
                // Don't trim non words characters (to allow search such as "C++")
                this.pipeline.remove(lunr.trimmer);
            }
        });
    }
    return searchIndex;
}

// Map of Lunr ref to document
var documentsStore = {};

var searchIndexEnabled = true;
var indexSize = 0;

function sanitize(html) {
    return striptags(html, [], ' ').trim() // strip html tags
        .replace(new RegExp('\n', 'g'), '') /* removes linebreaks   */ // eslint-disable-line no-control-regex
        .replace(/ +(?= )/g, '') // removes double spaces
        .replace(/&#123;|&quot;|&#125;|&lt;|&gt;/g, '');
}

module.exports = {
    book: {
        assets: './assets',
        js: [
            'lunr.min.js', 'search-lunr.js'
        ]
    },

    hooks: {
        // Index each page
        'page': function (page) {
            if (this.output.name != 'website' || !searchIndexEnabled || page.search === false) {
                return page;
            }

            const maxIndexSize = this.config.get('pluginsConfig.lunr.maxIndexSize') || this.config.get('lunr.maxIndexSize');

            this.log.debug.ln('index page', page.path);

            var text = sanitize(page.content);

            indexSize = indexSize + text.length;
            if (indexSize > maxIndexSize) {
                this.log.warn.ln('search index is too big, indexing is now disabled');
                searchIndexEnabled = false;
                return page;
            }

            var keywords = [];
            if (page.search) {
                keywords = page.search.keywords || [];
            }

            // Add to index
            var doc = {
                url: this.output.toURL(page.path),
                title: page.title,
                summary: page.description,
                keywords: keywords.join(' '),
                body: text
            };

            documentsStore[doc.url] = doc;
            getSearchIndex(this).add(doc);

            const $ = cheerio.load(page.content);

            $('h1,h2').each(function () {
                const elem = $(this);
        
                let body = [];
        
                elem.nextUntil('h2').each(function () {
                  body.push($(this).html());
                });
        
                body = body.join(' ');
        
                var subdoc = {
                    url: `${doc.url}#${elem.attr('id') || slugid(elem.text())}`,
                    title: sanitize(elem.html()),
                    summary: page.description,
                    keywords: '',
                    body: sanitize(body)
                };
    
                documentsStore[subdoc.url] = subdoc;
                getSearchIndex(this).add(subdoc);
              });                    

            return page;
        },

        // Write index to disk
        'finish': function () {
            if (this.output.name != 'website') return;

            this.log.debug.ln('write search index');
            return this.output.writeFile('search_index.json', JSON.stringify({
                index: getSearchIndex(this),
                store: documentsStore
            }));
        }
    }
};

