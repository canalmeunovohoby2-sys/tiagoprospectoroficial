/* BASE TÉCNICA — CONVERSÃO: microinterações (reveal, menu, contadores). */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reveal.
  var revealTargets = document.querySelectorAll("[data-reveal]");
  if (reduce || !("IntersectionObserver" in window)) {
    revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.14 });
    revealTargets.forEach(function (el) { obs.observe(el); });
  }

  // Contadores das estatísticas.
  var counters = document.querySelectorAll("[data-count-to]");
  var animateCount = function (el) {
    var raw = el.getAttribute("data-count-to") || "0";
    var target = parseFloat(raw);
    if (isNaN(target)) return;
    var decimals = (raw.split(".")[1] || "").length;
    var suffix = target >= 100 ? "%" : (el.textContent || "").replace(/[\d.,]/g, "");
    var start = performance.now();
    var dur = 1100;
    var step = function (now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var value = target * eased;
      el.textContent = value.toFixed(decimals) + (suffix && suffix !== "%" && decimals === 0 && target >= 24 ? "h" : suffix);
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = (decimals ? target.toFixed(decimals) : String(target)) + suffix;
    };
    requestAnimationFrame(step);
  };
  if (!reduce && "IntersectionObserver" in window) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCount(e.target); cObs.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cObs.observe(el); });
  }

  // Menu mobile.
  var toggle = document.querySelector(".nav-toggle");
  var mobileNav = document.getElementById("menu-mobile");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      if (open) mobileNav.setAttribute("hidden", "");
      else mobileNav.removeAttribute("hidden");
    });
    mobileNav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobileNav.setAttribute("hidden", "");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Header sombra ao rolar.
  var header = document.querySelector(".site-header");
  if (header) {
    window.addEventListener("scroll", function () {
      header.style.boxShadow = window.scrollY > 10 ? "0 10px 30px -22px rgba(0,0,0,.5)" : "none";
    }, { passive: true });
  }

  var yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
