"use strict";(()=>{(()=>{function m(){return document.getElementById("mobile-search-input")}function c(){return document.getElementById("mobile-search-results")}function u(){return document.getElementById("mobile-search-empty")}function f(){return document.getElementById("mobile-search-loading")}function h(e,t){let n=window.daybookSearchEngine;if(!n)return"";let a=n.highlightMatches(e.title,t),i=e.summary?`<p class="notes-item-summary">${n.highlightMatches(e.summary,t)}</p>`:"",s="";e.pin&&(s+='<span class="notes-item-pin" aria-hidden="true" title="\u5DF2\u56FA\u5B9A" data-article-shared="pin"></span>'),e.hasMusic&&(s+='<span class="material-symbol notes-item-music" aria-hidden="true" title="\u5305\u542B\u97F3\u4E50" data-article-shared="music">music_note_2</span>'),e.hasTranslation&&(s+='<span class="material-symbol notes-item-bilingual" aria-hidden="true" title="\u53CC\u8BED" data-article-shared="bilingual">translate</span>');let l=`<time datetime="${e.date}" data-article-shared="published">${e.date}</time>
      <span class="reading-time" data-article-shared="reading">${e.readingMinutes} min</span>`;e.updated&&(l+=` <span class="updated-time" data-article-shared="updated">&bull; updated <time datetime="${e.updated}">${e.updated}</time></span>`);let d=t&&a!==n.escapeHTML(e.title),g=t&&d?a:e.titleLayout||a;return`
<article class="notes-item" data-note-card>
  <div class="notes-item-header" data-transition-scope="${n.escapeHTML(e.url)}">
    <h1 class="notes-item-title">
      <a href="${e.url}" data-title-transition-key="${n.escapeHTML(e.url)}">
        ${g}
      </a>
    </h1>
    <div class="notes-item-indicators">
      ${s}
    </div>
    <p class="notes-item-meta">
      ${l}
    </p>
  </div>
  ${i}
</article>`}async function o(){let e=window.daybookSearchEngine;if(!e)return;let t=e.getCurrentQuery(),n=m();if(n&&n.value!==t&&(n.value=t),t&&n){let a=e.getCollectionContext(),i=await e.searchNotes(t,a.tagSlug),s=c(),l=u();s&&(s.innerHTML=i.map(d=>h(d,t)).join("")),l&&(l.hidden=i.length>0)}else{let a=c(),i=u();a&&(a.innerHTML=""),i&&(i.hidden=!0)}}let r;function p(e){let t=window.daybookSearchEngine;t&&(clearTimeout(r),r=window.setTimeout(()=>{let n=e.value.trim();t.updateSearchURL(n),o()},150))}document.addEventListener("input",function(e){let t=e.target;t&&t.id==="mobile-search-input"&&p(t)}),document.addEventListener("focusin",function(e){let t=e.target;if(t&&t.closest("[data-notes-search]")){let n=window.daybookSearchEngine;n&&n.loadSearchIndex()}}),document.addEventListener("click",function(e){let t=e.target;if(!t)return;if(t.closest('[data-mobile-overlay-target="search"]')){let a=window.daybookSearchEngine;a&&a.loadSearchIndex()}}),document.addEventListener("daybook:page-load",()=>{clearTimeout(r),o()}),document.readyState==="loading"?document.addEventListener("DOMContentLoaded",o):o()})();})();
