(function () {
  var compactNumberFormat = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  // Fetch repository data from GitHub API with caching
  async function fetchRepoData(repo) {
    var cacheKey = "github-repo-" + repo;

    // Check session storage for cached data
    try {
      var cachedData = sessionStorage.getItem(cacheKey);
      if (cachedData) {
        return JSON.parse(cachedData);
      }
    } catch (e) {
      try {
        sessionStorage.removeItem(cacheKey);
      } catch (err) {}
    }

    // Fetch from API if not cached
    try {
      var response = await fetch("https://api.github.com/repos/" + repo);
      if (!response.ok) {
        console.warn(
          "[GithubCard] Failed to fetch " +
            repo +
            ": " +
            response.status +
            " " +
            response.statusText
        );
        return null;
      }

      var raw = await response.json();
      var data = {
        owner: { avatar_url: raw.owner && raw.owner.avatar_url },
        description: raw.description,
        stargazers_count: raw.stargazers_count,
        forks_count: raw.forks_count,
        license: raw.license ? { spdx_id: raw.license.spdx_id } : null,
      };

      // Cache the successful response
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(data));
      } catch (err) {}

      return data;
    } catch (error) {
      console.error("[GithubCard] Failed to fetch " + repo + ":", error);
      return null;
    }
  }

  // Update card UI with repository data
  function updateCardUI(card, data) {
    var setText = function (selector, text) {
      var el = card.querySelector(selector);
      if (el) {
        el.textContent = text;
      }
    };

    if (!data) {
      setText(".gc-repo-description", "Failed to load data");
      return;
    }

    var avatar = card.querySelector(".gc-owner-avatar");
    if (avatar && data.owner && data.owner.avatar_url) {
      avatar.style.backgroundImage = "url(" + data.owner.avatar_url + ")";
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
    }

    setText(".gc-repo-description", data.description || "No description");
    setText(".gc-stars-count", compactNumberFormat.format(data.stargazers_count || 0));
    setText(".gc-forks-count", compactNumberFormat.format(data.forks_count || 0));
    setText(".gc-license-info", (data.license && data.license.spdx_id) || "No License");
  }

  // Load data for a specific card element
  async function loadRepoData(card) {
    var repo = card.getAttribute("data-repo");
    if (!repo) {
      return;
    }

    var data = await fetchRepoData(repo);
    updateCardUI(card, data);
  }

  // Initialize all GitHub cards on the page
  function setupGithubCards() {
    var cards = document.querySelectorAll(".gc-container");
    cards.forEach(function (card) {
      loadRepoData(card);
    });
  }

  // Setup Twitter Widgets
  function setupTweets() {
    var tweets = document.querySelectorAll(".twitter-tweet");
    if (tweets.length === 0) {
      return;
    }

    // Set theme before loading
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    tweets.forEach(function (tweet) {
      tweet.setAttribute("data-theme", isDark ? "dark" : "light");
    });

    if (window.twttr && window.twttr.widgets) {
      window.twttr.widgets.load();
    } else if (!document.getElementById("twitter-wjs")) {
      var script = document.createElement("script");
      script.id = "twitter-wjs";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      document.head.appendChild(script);
    }
  }

  function updateTweetTheme() {
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    var iframes = document.querySelectorAll("iframe[src*='twitter.com/']");
    
    // There is no clean way to dynamically switch existing tweet iframes 
    // using just the widget API, but you can post a message to them.
    iframes.forEach(function (iframe) {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { element: iframe.id, query: "tw-obj", action: "updateWidget", data: { theme: isDark ? "dark" : "light" } },
          "*"
        );
      }
    });
  }

  window.daybookSyncEmbeds = function () {
    setupGithubCards();
    setupTweets();
  };

  document.addEventListener("DOMContentLoaded", function () {
    window.daybookSyncEmbeds();
  });

  // Listen to theme changes if there's a custom event or observer
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.attributeName === "data-theme") {
        updateTweetTheme();
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

})();
