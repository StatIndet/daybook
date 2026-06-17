(function () {
  var imageSelector = ".post-content img";
  var noLightboxSelector = ".no-lightbox, [data-no-lightbox=\"true\"]";
  var elements = {};
  var state = {
    isOpen: false,
    images: [],
    index: 0,
    trigger: null,
    triggerTabIndex: null,
    scrollX: 0,
    scrollY: 0,
  };

  function plainPrimaryClick(event) {
    return !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey;
  }

  function closestFromEvent(event, selector) {
    var target = event.target;
    if (!target) {
      return null;
    }
    if (target.closest) {
      return target.closest(selector);
    }
    if (target.parentElement && target.parentElement.closest) {
      return target.parentElement.closest(selector);
    }
    return null;
  }

  function lightboxImage(img) {
    if (!img || !img.matches || !img.matches(imageSelector)) {
      return false;
    }
    if (img.matches(noLightboxSelector)) {
      return false;
    }
    if (img.closest("a[href]")) {
      return false;
    }
    return Boolean(img.currentSrc || img.src);
  }

  function collectImages() {
    return Array.prototype.slice.call(document.querySelectorAll(imageSelector)).filter(lightboxImage);
  }

  function createButton(className, label, iconName) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "daybook-lightbox__button " + className;
    button.setAttribute("aria-label", label);

    var icon = document.createElement("span");
    icon.className = "material-symbol";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconName;
    button.appendChild(icon);

    return button;
  }

  function ensureLightbox() {
    if (elements.root && document.body.contains(elements.root)) {
      return;
    }

    var root = document.createElement("div");
    root.className = "daybook-lightbox";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("aria-label", "图片浏览器");
    root.tabIndex = -1;

    var closeButton = createButton("daybook-lightbox__button--close", "关闭图片浏览器", "close");
    var prevButton = createButton("daybook-lightbox__button--prev", "上一张图片", "chevron_left");
    var nextButton = createButton("daybook-lightbox__button--next", "下一张图片", "chevron_right");

    var figure = document.createElement("figure");
    figure.className = "daybook-lightbox__figure";

    var image = document.createElement("img");
    image.className = "daybook-lightbox__image";
    image.alt = "";

    var meta = document.createElement("figcaption");
    meta.className = "daybook-lightbox__meta";

    var caption = document.createElement("span");
    caption.className = "daybook-lightbox__caption";

    var counter = document.createElement("span");
    counter.className = "daybook-lightbox__counter";

    meta.appendChild(caption);
    meta.appendChild(counter);
    figure.appendChild(image);
    figure.appendChild(meta);

    root.appendChild(closeButton);
    root.appendChild(prevButton);
    root.appendChild(figure);
    root.appendChild(nextButton);
    document.body.appendChild(root);

    elements = {
      root: root,
      image: image,
      caption: caption,
      counter: counter,
      closeButton: closeButton,
      prevButton: prevButton,
      nextButton: nextButton,
    };
  }

  function setScrollLock(locked) {
    if (locked) {
      state.scrollX = window.scrollX || window.pageXOffset || 0;
      state.scrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.top = "-" + state.scrollY + "px";
      document.body.classList.add("daybook-lightbox-lock");
      return;
    }

    document.body.classList.remove("daybook-lightbox-lock");
    document.body.style.removeProperty("top");
    window.scrollTo(state.scrollX, state.scrollY);
  }

  function setTriggerFocusTarget(img) {
    state.trigger = img;
    state.triggerTabIndex = img.getAttribute("tabindex");
    if (state.triggerTabIndex === null) {
      img.setAttribute("tabindex", "-1");
    }
  }

  function restoreTriggerFocus() {
    var trigger = state.trigger;
    if (!trigger) {
      return;
    }

    if (state.triggerTabIndex === null) {
      trigger.removeAttribute("tabindex");
    } else {
      trigger.setAttribute("tabindex", state.triggerTabIndex);
    }

    if (document.body.contains(trigger) && trigger.focus) {
      try {
        trigger.focus({ preventScroll: true });
      } catch (error) {
        trigger.focus();
      }
    }
  }

  function showImage(index) {
    if (!state.images.length) {
      return;
    }

    var total = state.images.length;
    state.index = (index + total) % total;

    var source = state.images[state.index];
    var src = source.currentSrc || source.src;
    var alt = source.getAttribute("alt") || "";

    elements.image.src = src;
    elements.image.alt = alt;

    elements.caption.textContent = alt;
    elements.caption.hidden = alt.trim() === "";

    elements.counter.textContent = total > 1 ? (state.index + 1) + " / " + total : "";
    elements.counter.hidden = total <= 1;

    var single = total <= 1;
    elements.root.classList.toggle("is-single", single);
    elements.prevButton.hidden = single;
    elements.nextButton.hidden = single;
  }

  function openLightbox(img) {
    ensureLightbox();

    var images = collectImages();
    var index = images.indexOf(img);
    if (index < 0) {
      return;
    }

    state.images = images;
    state.isOpen = true;
    setTriggerFocusTarget(img);
    setScrollLock(true);

    elements.root.classList.add("is-open");
    elements.root.setAttribute("aria-hidden", "false");
    showImage(index);
    elements.closeButton.focus();
  }

  function closeLightbox() {
    if (!state.isOpen || !elements.root) {
      return;
    }

    state.isOpen = false;
    elements.root.classList.remove("is-open");
    elements.root.setAttribute("aria-hidden", "true");
    elements.image.removeAttribute("src");
    setScrollLock(false);
    restoreTriggerFocus();
    state.images = [];
    state.trigger = null;
    state.triggerTabIndex = null;
  }

  function nextImage() {
    showImage(state.index + 1);
  }

  function previousImage() {
    showImage(state.index - 1);
  }

  document.addEventListener("click", function (event) {
    var closeButton = closestFromEvent(event, ".daybook-lightbox__button--close");
    if (closeButton) {
      closeLightbox();
      return;
    }

    var prevButton = closestFromEvent(event, ".daybook-lightbox__button--prev");
    if (prevButton) {
      previousImage();
      return;
    }

    var nextButton = closestFromEvent(event, ".daybook-lightbox__button--next");
    if (nextButton) {
      nextImage();
      return;
    }

    if (elements.root && event.target === elements.root) {
      closeLightbox();
      return;
    }

    if (!plainPrimaryClick(event)) {
      return;
    }

    var img = closestFromEvent(event, imageSelector);
    if (!lightboxImage(img)) {
      return;
    }

    event.preventDefault();
    openLightbox(img);
  });

  document.addEventListener("keydown", function (event) {
    if (!state.isOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeLightbox();
      return;
    }

    if (state.images.length <= 1) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousImage();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextImage();
    }
  });
})();
