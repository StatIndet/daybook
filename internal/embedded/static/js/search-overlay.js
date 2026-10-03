"use strict";(()=>{(()=>{function h(){return document.getElementById("mobile-search-input")}function u(){return document.getElementById("mobile-search-results")}function m(){return document.getElementById("mobile-search-empty")}function f(){return document.getElementById("mobile-search-loading")}function p(e,t){let n=window.daybookSearchEngine;if(!n)return"";let a=n.highlightMatches(e.title,t),i=e.summary?`<p class="notes-item-summary">${n.highlightMatches(e.summary,t)}</p>`:"",s="";e.pinned&&(s+='<span class="notes-item-pin" aria-hidden="true" title="\u5DF2\u56FA\u5B9A" data-article-shared="pin"></span>'),e.hasMusic&&(s+='<span class="material-symbol notes-item-music" aria-hidden="true" title="\u5305\u542B\u97F3\u4E50" data-article-shared="music">music_note_2</span>'),e.hasTranslation&&(s+='<span class="material-symbol notes-item-bilingual" aria-hidden="true" title="\u53CC\u8BED" data-article-shared="bilingual">translate</span>');let o=`<time datetime="${e.date}" data-article-shared="published">${e.date}</time>`;e.section!=="memos"&&(o+=` <span class="reading-time" data-article-shared="reading">${e.readingMinutes} min</span>`),e.updated&&(o+=` <span class="updated-time" data-article-shared="updated">&bull; updated <time datetime="${e.updated}">${e.updated}</time></span>`);let c=t&&a!==n.escapeHTML(e.title),l=t&&c?a:e.titleLayout||a;return`
<article class="notes-item" data-note-card>
  <div class="notes-item-header" data-transition-scope="${n.escapeHTML(e.url)}">
    <h1 class="notes-item-title">
      <a href="${e.url}" data-title-transition-key="${n.escapeHTML(e.url)}">
        ${l}
      </a>
    </h1>
    <div class="notes-item-indicators">
      ${s}
    </div>
    <p class="notes-item-meta">
      ${o}
    </p>
  </div>
  ${i}
</article>`}async function r(){let e=window.daybookSearchEngine;if(!e)return;let t=e.getCurrentQuery(),n=h();if(n&&n.value!==t&&(n.value=t),t&&n){let a=e.getCollectionContext(),i=await e.searchNotes(t,a.tagSlug),s=a.kind==="notes"?i.filter(l=>l.section!=="memos"):i,o=u(),c=m();o&&(o.innerHTML=s.map(l=>p(l,t)).join("")),c&&(c.hidden=s.length>0)}else{let a=u(),i=m();a&&(a.innerHTML=""),i&&(i.hidden=!0)}}let d;function g(e){let t=window.daybookSearchEngine;t&&(clearTimeout(d),d=window.setTimeout(()=>{let n=e.value.trim();t.updateSearchURL(n),r()},150))}document.addEventListener("input",function(e){let t=e.target;t&&t.id==="mobile-search-input"&&g(t)}),document.addEventListener("focusin",function(e){let t=e.target;if(t&&t.closest("[data-notes-search]")){let n=window.daybookSearchEngine;n&&n.loadSearchIndex()}}),document.addEventListener("click",function(e){let t=e.target;if(!t)return;if(t.closest('[data-mobile-overlay-target="search"]')){let a=window.daybookSearchEngine;a&&a.loadSearchIndex()}}),document.addEventListener("daybook:page-load",()=>{clearTimeout(d),r()}),document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r):r()})();})();
